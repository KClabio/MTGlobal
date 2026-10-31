// Test data in the dev database (MONGO_URI from .env). Everything a test adds is removed by cleanup():
// temp users (zztest-…@example.com) with their sessions, records registered with removeLater(),
// and documents saved with restoreLater() are put back as they were.
import 'dotenv/config';
import mongoose from 'mongoose';
import { createRequire } from 'module';
import { BASE } from './browser.mjs';

const twoFactor = createRequire(import.meta.url)('../../lib/two-factor.js');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mtglobal_db';
const STAMP = Date.now();
const users = [];
const removals = []; // [collection, filter]
const restores = []; // [collection, docs]

export async function db() {
  if (mongoose.connection.readyState !== 1) await mongoose.connect(MONGO_URI);
  return mongoose.connection.db;
}

/** The 6-digit app code for a two-step key right now (lib/two-factor.js) */
export function twoStepCode(secret, at = Date.now()) {
  return twoFactor.codeFor(twoFactor.base32Decode(secret), twoFactor.stepAt(at));
}

/**
 * Takes a logged-in staff client through two-step login (lib/two-factor.js, routes/auth.js), like a person would: the
 * code page (set up by opening Quản trị when nothing is pending), the QR key read off the setup page or `secret` for an
 * account that has it, one code, then the backup codes page. c.req(path, { method, body }) → { status, location, text },
 * keeping the session cookie. Returns { secret, backupCodes } (backupCodes: only right after a setup).
 * The test server (TWO_STEP_TEST_REUSE=1) lets one code be used more than once, so quick logins don't wait 30 s.
 */
export async function passTwoStep(c, { secret = null } = {}) {
  let page = await c.req('/dang-nhap/xac-minh');
  if (page.status !== 200) {
    const admin = await c.req('/admin');
    if (admin.status === 200) return { secret, backupCodes: [] }; // already past it
    page = await c.req('/dang-nhap/xac-minh');
  }
  const mode = (page.text.match(/data-two-step="(\w+)"/) || [])[1];
  if (!mode) throw new Error(`two-step page not shown (HTTP ${page.status})`);
  if (mode !== 'verify') secret = page.text.match(/data-two-step-key>([^<]+)</)[1].replace(/\s/g, '');
  if (!secret) throw new Error('two-step: this account has a key the test does not know');
  const sent = await c.req('/dang-nhap/xac-minh', { method: 'POST', body: new URLSearchParams({ code: twoStepCode(secret) }) });
  if (sent.status !== 303) throw new Error(`two-step code refused (HTTP ${sent.status})`);
  let backupCodes = [];
  if (sent.location === '/dang-nhap/ma-du-phong') {
    const codes = await c.req('/dang-nhap/ma-du-phong');
    backupCodes = [...codes.text.matchAll(/<li><code>([a-z0-9-]+)<\/code><\/li>/g)].map((m) => m[1]);
  }
  await c.req('/'); // uses up the "Đăng nhập thành công" notice
  return { secret, backupCodes };
}

/** A minimal cookie-keeping client for one session id (for passTwoStep) */
export function sidClient(sid) {
  const c = {
    sid,
    async req(path, { method = 'GET', body } = {}) {
      const res = await fetch(BASE + path, { method, body, redirect: 'manual', headers: { cookie: `connect.sid=${c.sid}`, accept: 'text/html' } });
      const set = res.headers.getSetCookie().find((x) => x.startsWith('connect.sid='));
      if (set) c.sid = set.split(';')[0].slice('connect.sid='.length);
      return { status: res.status, location: res.headers.get('location'), text: await res.text() };
    },
  };
  return c;
}

/**
 * Registers a user through the site and returns { email, password, sid, id }. role: 'admin' | 'owner' | 'customer'.
 * Staff accounts are also taken through two-step login (setup), so sid opens Quản trị; they also get
 * { twoStepSecret, backupCodes }.
 */
export async function createUser(tag, role = 'admin') {
  const email = `zztest-${tag}-${STAMP}@example.com`;
  const password = 'zz-secret1';
  const res = await fetch(BASE + '/dang-ky', { method: 'POST', redirect: 'manual', body: new URLSearchParams({ name: `ZZ ${tag}`, email, password, confirmPassword: password, agreePrivacy: '1' }) });
  if (res.status !== 303) throw new Error(`register failed for ${email} (HTTP ${res.status})`);
  // Signing up doesn't log in: log in like a visitor would
  const login = await fetch(BASE + '/dang-nhap', { method: 'POST', redirect: 'manual', body: new URLSearchParams({ email, password }) });
  const cookie = login.headers.getSetCookie().find((c) => c.startsWith('connect.sid='));
  if (!cookie) throw new Error(`login failed for ${email} (HTTP ${login.status})`);
  // Open Trang chủ once: it uses up the "Đăng nhập thành công" notice, which would otherwise cover the account menu
  await fetch(BASE + '/', { headers: { cookie: cookie.split(';')[0], accept: 'text/html' } });
  const d = await db();
  const user = await d.collection('users').findOne({ email });
  users.push(user._id);
  const sid = cookie.split(';')[0].slice('connect.sid='.length);
  if (role === 'customer') return { email, password, id: user._id, sid };
  await d.collection('users').updateOne({ _id: user._id }, { $set: { role } });
  const c = sidClient(sid);
  const { secret, backupCodes } = await passTwoStep(c);
  return { email, password, id: user._id, sid: c.sid, twoStepSecret: secret, backupCodes };
}

/**
 * Clears the per-address count of wrong passwords and codes for this computer (lib/login-throttle.js: 30 in 15 minutes
 * lock an address). Tests make wrong attempts on purpose; left behind, a few runs in a row would lock every login
 * from localhost, the owner's :3000 site included. Run at every file's cleanup, and after a test's wrong-attempt burst.
 */
export async function clearLocalLoginLimit() {
  await (await db()).collection('loginthrottles').deleteMany({ _id: { $in: ['ip:::1', 'ip:127.0.0.1', 'ip:::ffff:127.0.0.1'] } });
}

/** Deletes the matching records at cleanup (e.g. removeLater('quoterequests', { name: /^ZZ / })). */
export function removeLater(collection, filter) { removals.push([collection, filter]); }

/** Saves the matching documents now and writes them back at cleanup. */
export async function restoreLater(collection, filter) {
  const docs = await (await db()).collection(collection).find(filter).toArray();
  restores.push([collection, docs]);
  return docs;
}

export async function cleanup() {
  if (mongoose.connection.readyState !== 1) return;
  const d = mongoose.connection.db;
  for (const [collection, docs] of restores.reverse()) {
    for (const doc of docs) await d.collection(collection).replaceOne({ _id: doc._id }, doc);
  }
  for (const [collection, filter] of removals) await d.collection(collection).deleteMany(filter);
  // also accounts a test registered itself with this run's stamp (zztest-<tag>-<stamp>@example.com)
  for (const u of await d.collection('users').find({ email: new RegExp(`^zztest-.*-${STAMP}@example\\.com$`) }).toArray()) {
    if (!users.some((id) => String(id) === String(u._id))) users.push(u._id);
  }
  // errors a test caused on purpose while logged in as a temp account (Admin → Nhật ký lỗi, lib/error-log.js)
  await d.collection('errorlogs').deleteMany({ userId: { $in: users } });
  for (const id of users) {
    await d.collection('sessions').deleteMany({ session: { $regex: String(id) } });
    await d.collection('users').deleteOne({ _id: id });
  }
  // wrong-password counts of this run's temp accounts (login limit, lib/login-throttle.js)
  await d.collection('loginthrottles').deleteMany({ _id: new RegExp(`^email:zztest-.*-${STAMP}@example\\.com$`) });
  // wrong two-step codes of this run's temp accounts (code:<user id>)
  await d.collection('loginthrottles').deleteMany({ _id: { $in: users.map((id) => `code:${id}`) } });
  await clearLocalLoginLimit();
  await mongoose.disconnect();
}

export const stamp = STAMP;
