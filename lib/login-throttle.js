// Login attempt limit (routes/auth.js, POST /dang-nhap):
//  - per account: 5 wrong passwords within 15 minutes lock that email's password login for 15 minutes (even the right
//    password is refused meanwhile, so guessing gains nothing); a successful login clears the count. Unknown emails
//    count the same way, so the answer never reveals whether an account exists.
//  - per address (req.ip, the visitor's real address behind the host's proxy): 30 wrong passwords within 15 minutes,
//    on any accounts, block that address for 15 minutes. Generous for a school or office sharing one address.
// Stored in MongoDB (models/LoginThrottle.js), so it survives restarts and is shared by several server copies.
const LoginThrottle = require('../models/LoginThrottle');

const WINDOW_MS = 15 * 60 * 1000;
const LOCK_MS = 15 * 60 * 1000;
const LIMITS = { email: 5, ip: 30, code: 5 };

const keyFor = (kind, value) => `${kind}:${String(value || '').toLowerCase().trim()}`;

/** Whole minutes left on a lock (at least 1 while locked), 0 when not locked */
function minutesLeft(doc, now = Date.now()) {
  if (!doc || !doc.lockedUntil) return 0;
  const ms = new Date(doc.lockedUntil).getTime() - now;
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

/** Minutes to wait before this email may try again from this address (0: go ahead) */
async function check(email, ip) {
  const keys = [email && keyFor('email', email), ip && keyFor('ip', ip)].filter(Boolean);
  if (!keys.length) return 0;
  const docs = await LoginThrottle.find({ _id: { $in: keys } }).lean();
  return Math.max(0, ...docs.map((d) => minutesLeft(d)));
}

/** Counts one wrong attempt under one key; locks it when it reaches its kind's limit */
async function countFail(kind, value, now) {
  const _id = keyFor(kind, value);
  // Inside the current 15 minutes: add one (atomic, so attempts sent at once are all counted)
  let doc = await LoginThrottle.findOneAndUpdate({ _id, windowStart: { $gt: new Date(now - WINDOW_MS) } }, { $inc: { fails: 1 } }, { returnDocument: 'after' }).lean();
  // Otherwise a new 15 minutes starts with this attempt
  if (!doc) {
    doc = await LoginThrottle.findOneAndUpdate({ _id }, { $set: { fails: 1, windowStart: new Date(now), lockedUntil: null, expiresAt: new Date(now + WINDOW_MS) } }, { upsert: true, returnDocument: 'after' }).lean();
  }
  if (doc.fails >= LIMITS[kind] && !minutesLeft(doc, now)) {
    const until = new Date(now + LOCK_MS);
    await LoginThrottle.updateOne({ _id }, { $set: { lockedUntil: until, expiresAt: until } });
  }
}

/** Counts one wrong password for the email and for the address; locks one that reaches its limit */
async function fail(email, ip) {
  const now = Date.now();
  for (const [kind, value] of [['email', email], ['ip', ip]]) {
    if (value) await countFail(kind, value, now);
  }
}

/** A successful login clears that account's count (the address count stays: it covers many accounts) */
async function succeed(email) {
  if (email) await LoginThrottle.deleteOne({ _id: keyFor('email', email) });
}

// Two-step login codes (lib/two-factor.js): 5 wrong codes within 15 minutes lock that account's code step for 15
// minutes; they also count towards the address's 30.
async function checkCode(userId, ip) {
  const keys = [userId && keyFor('code', userId), ip && keyFor('ip', ip)].filter(Boolean);
  if (!keys.length) return 0;
  const docs = await LoginThrottle.find({ _id: { $in: keys } }).lean();
  return Math.max(0, ...docs.map((d) => minutesLeft(d)));
}

async function failCode(userId, ip) {
  const now = Date.now();
  for (const [kind, value] of [['code', userId], ['ip', ip]]) {
    if (value) await countFail(kind, value, now);
  }
}

async function succeedCode(userId) {
  if (userId) await LoginThrottle.deleteOne({ _id: keyFor('code', userId) });
}

module.exports = { check, fail, succeed, checkCode, failCode, succeedCode, minutesLeft, keyFor, LIMITS, WINDOW_MS, LOCK_MS };
