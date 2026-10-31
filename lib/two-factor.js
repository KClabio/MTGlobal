// Two-step login for staff (owner and admin): after the password (or "Đăng nhập bằng Google"), a 6-digit code from an
// authenticator app (Google Authenticator, Microsoft Authenticator…) or one of 10 one-time backup codes. routes/auth.js
// runs the pages; middleware/auth.js keeps Quản trị closed until this session has passed the code.
//
// The codes are standard TOTP (RFC 6238: HMAC-SHA1, 6 digits, 30 seconds), written here with Node's own crypto instead
// of a package, and checked against the RFC's test values in tests/unit.test.mjs.
//  - The app key is stored locked (AES-256-GCM) with a key taken from SESSION_SECRET (init() in server.js). If
//    SESSION_SECRET changes, stored keys can't be opened any more: staff then simply set up two-step again.
//  - Backup codes are stored as SHA-256 hashes; each works once.
//  - A code that was already used (same 30 seconds or older) is refused, so a code seen over someone's shoulder can't
//    be used again. Only the test server (TWO_STEP_TEST_REUSE=1, never with NODE_ENV=production) lets the many quick
//    test logins reuse one.
const crypto = require('crypto');

const ISSUER = 'MTG';
const DIGITS = 6;
const PERIOD = 30; // seconds
const DRIFT = 1; // a phone clock up to 30 s off still works
const BACKUP_COUNT = 10;
const PENDING_MS = 10 * 60 * 1000; // a half-finished login (password given, code not yet) lasts 10 minutes

// ---- Base32 (RFC 4648), the format authenticator apps read ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text) {
  const clean = String(text || '').toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('not base32');
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

// ---- TOTP ----
const stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / PERIOD);

/** The code for one 30-second step (RFC 4226 dynamic truncation); algorithm 'sha1' unless the RFC tests ask otherwise */
function codeFor(keyBuf, step, { digits = DIGITS, algorithm = 'sha1' } = {}) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = crypto.createHmac(algorithm, keyBuf).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  const num = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(num).padStart(digits, '0');
}

const sameText = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Checks a 6-digit code against a Base32 key. lastStep: the step of the last code accepted for this account;
 * a code from that step or older is refused (unless reuse is allowed on the test server).
 * → { ok: true, step } | { ok: false, reused?: true }
 */
function checkCode(secretB32, code, { now = Date.now(), lastStep = null, allowReuse = reuseAllowed() } = {}) {
  const typed = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(typed)) return { ok: false };
  let key;
  try { key = base32Decode(secretB32); } catch { return { ok: false }; }
  const current = stepAt(now);
  for (let d = -DRIFT; d <= DRIFT; d++) {
    const step = current + d;
    if (sameText(codeFor(key, step), typed)) {
      if (!allowReuse && lastStep != null && step <= lastStep) return { ok: false, reused: true };
      return { ok: true, step };
    }
  }
  return { ok: false };
}

function reuseAllowed(env = process.env) {
  return env.TWO_STEP_TEST_REUSE === '1' && env.NODE_ENV !== 'production';
}

/** A new random app key (160 bits, as RFC 4226 recommends), Base32 */
function newSecret() {
  return base32Encode(crypto.randomBytes(20));
}

/** The address an authenticator app reads from the QR code: "MTG (email)" in the app's list */
function otpauthUri(email, secretB32) {
  const label = encodeURIComponent(`${ISSUER}:${email}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(ISSUER)}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD}`;
}

/** The key in groups of 4 for typing by hand ("ABCD EFGH …") */
const groupKey = (secretB32) => secretB32.replace(/(.{4})/g, '$1 ').trim();

// ---- Locking the stored key ----
let lockKey = null;

/** server.js passes the session secret once at start-up */
function init(sessionSecret) {
  lockKey = Buffer.from(crypto.hkdfSync('sha256', String(sessionSecret), 'mtg', 'two-step-login-key', 32));
}

function seal(secretB32) {
  if (!lockKey) throw new Error('two-factor: init() not called');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', lockKey, iv);
  const data = Buffer.concat([cipher.update(secretB32, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

/** The Base32 key, or null when it can't be opened (SESSION_SECRET changed, or not a sealed value) */
function open(sealed) {
  if (!lockKey || typeof sealed !== 'string') return null;
  const [v, iv, tag, data] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !data) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', lockKey, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

// ---- Backup codes ("abcd-2345") ----
const BACKUP_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o, 1/l/i: easy to read off paper

const normalizeBackup = (code) => String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const hashBackup = (code) => crypto.createHash('sha256').update(normalizeBackup(code)).digest('hex');

/** 10 new codes: { codes (shown once), hashes (stored) } */
function newBackupCodes(count = BACKUP_COUNT) {
  const codes = [];
  while (codes.length < count) {
    const bytes = crypto.randomBytes(8);
    const raw = Array.from(bytes, (b) => BACKUP_CHARS[b % BACKUP_CHARS.length]).join('');
    const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
    if (!codes.includes(code)) codes.push(code);
  }
  return { codes, hashes: codes.map(hashBackup) };
}

/** Index of the matching stored hash, or -1. Looks like a backup code: 8 letters/digits, dash optional. */
function findBackup(hashes, code) {
  if (normalizeBackup(code).length !== 8) return -1;
  const h = hashBackup(code);
  return (hashes || []).findIndex((x) => sameText(x, h));
}

/** Two-step is set up on this account and its key can be opened */
function isEnabled(user) {
  return !!(user && user.twoFactor && user.twoFactor.enabledAt && open(user.twoFactor.secret));
}

module.exports = {
  ISSUER, DIGITS, PERIOD, BACKUP_COUNT, PENDING_MS,
  base32Encode, base32Decode, codeFor, stepAt, checkCode, reuseAllowed,
  newSecret, otpauthUri, groupKey, init, seal, open,
  newBackupCodes, findBackup, normalizeBackup, isEnabled,
};
