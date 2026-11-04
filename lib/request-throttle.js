// Limits for requests sent without an account (routes/index.js) and for the confirmation emails they lead to
// (lib/request-mail.js):
//  - per address (req.ip): 5 guest requests an hour; the next one is refused with a clear message (429)
//  - per recipient: 3 confirmation emails a day, so the form can't be used to fill a stranger's inbox
// Stored with the login limit's records (models/LoginThrottle.js, "request-ip:…" and "confirm-to:…"), which MongoDB
// deletes by itself once they expire.
const LoginThrottle = require('../models/LoginThrottle');
const { keyFor } = require('./login-throttle');

const HOUR_MS = 60 * 60 * 1000;
const LIMITS = {
  guestRequest: { kind: 'request-ip', max: 5, windowMs: HOUR_MS },
  confirmation: { kind: 'confirm-to', max: 3, windowMs: 24 * HOUR_MS },
  resetEmail: { kind: 'reset-to', max: 3, windowMs: HOUR_MS }, // "Quên mật khẩu" (lib/password-reset.js)
  resetAddress: { kind: 'reset-ip', max: 10, windowMs: HOUR_MS },
};

/** Counts one use for this value; false (and nothing counted) when its limit is already reached */
async function take(name, value, now = Date.now()) {
  const { kind, max, windowMs } = LIMITS[name];
  if (!value) return true;
  const _id = keyFor(kind, value);
  const cutoff = new Date(now - windowMs);
  const inWindow = { _id, windowStart: { $gt: cutoff } };
  // More than one round: when several uses arrive together and only one can start the window, the others count inside it
  for (let round = 0; round < 3; round += 1) {
    // Inside the current window and under the limit: add one (atomic, so requests sent at once are all counted)
    if (await LoginThrottle.findOneAndUpdate({ ...inWindow, fails: { $lt: max } }, { $inc: { fails: 1 } }).lean()) return true;
    if (await LoginThrottle.exists({ ...inWindow, fails: { $gte: max } })) return false;
    // No window yet, or the last one is over: a new one starts with this use. The filter matches only a finished window,
    // so a second use at the same moment finds none, tries to insert the same _id and is refused by MongoDB
    try {
      await LoginThrottle.updateOne(
        { _id, $or: [{ windowStart: null }, { windowStart: { $lte: cutoff } }] },
        { $set: { fails: 1, windowStart: new Date(now), lockedUntil: null, expiresAt: new Date(now + windowMs) } },
        { upsert: true },
      );
      return true;
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  return false;
}

module.exports = { take, LIMITS };
