// Server errors: written to the console as before, saved in MongoDB (models/ErrorLog.js, listed in Admin → Nhật ký lỗi)
// and, when an email account is set in .env (lib/mailer.js + ALERT_EMAIL_TO), sent by email: at most one email per
// kind of error per hour, so a broken page visited 500 times sends one email, not 500.
// record() never throws and never waits for the email, so a failing log can't break the page that had the error.
const crypto = require('crypto');
const mongoose = require('mongoose');
const ErrorLog = require('../models/ErrorLog');
const mailer = require('./mailer');
const { isDbUnavailable } = require('./db-guard');
const { renderMail } = require('./mail-layout');

const EMAIL_EVERY_MS = 60 * 60 * 1000;
const STACK_LINES = 15;

// The same error on another record ("Cast to ObjectId failed for value 6acb…") counts as the same kind
function kindKey(err) {
  const firstFrame = String(err.stack || '').split('\n').find((l) => /^\s+at /.test(l)) || '';
  const message = String(err.message || '').replace(/\b[0-9a-f]{24}\b/gi, '<id>').replace(/\d+/g, '#');
  return crypto.createHash('sha1').update(`${err.name}|${message}|${firstFrame.trim()}`).digest('hex');
}

function placeOf(req, where) {
  if (where) return where;
  if (req) return `${req.method} ${(req.originalUrl || req.url || '').split('?')[0]}`; // never the query (may hold tokens)
  return '';
}

function siteBase(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  return req ? `${req.protocol}://${req.get('host')}` : '';
}

async function save(err, { req, where, status }) {
  const now = new Date();
  const update = {
    $inc: { count: 1 },
    $set: {
      message: String(err.message || err).slice(0, 1000),
      stack: String(err.stack || '').split('\n').slice(0, STACK_LINES).join('\n'),
      where: placeOf(req, where).slice(0, 300),
      status: status || 500,
      userId: req && req.user ? req.user._id : null,
      lastAt: now,
      seen: false,
    },
    $setOnInsert: { name: err.name || 'Error', firstAt: now },
  };
  const key = kindKey(err);
  try {
    return await ErrorLog.findOneAndUpdate({ key }, update, { upsert: true, returnDocument: 'after' }).lean();
  } catch (e) {
    if (e.code !== 11000) throw e; // two copies of the same new error at once: the other one created it, count again
    return ErrorLog.findOneAndUpdate({ key }, update, { returnDocument: 'after' }).lean();
  }
}

async function emailAlert(doc, req) {
  const to = process.env.ALERT_EMAIL_TO;
  if (!to || !mailer.isConfigured()) return;
  // Claim the email for this hour first (atomic), so two errors at once, or two server copies, send only one
  const now = new Date();
  const claimed = await ErrorLog.findOneAndUpdate(
    { _id: doc._id, $or: [{ lastEmailAt: null }, { lastEmailAt: { $lt: new Date(now - EMAIL_EVERY_MS) } }] },
    { $set: { lastEmailAt: now } },
  ).lean();
  if (!claimed) return;
  const account = req ? (req.user ? req.user.email : 'Khách (không đăng nhập)') : '';
  await mailer.sendMail({ to, ...alertMail(doc, { base: siteBase(req), at: now, account }) });
}

const vnTime = (date) => new Date(date).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

/**
 * The alert email for one logged error (doc: an ErrorLog record), in the MTG layout (lib/mail-layout.js).
 * account: who was logged in ('' for a background job). No stack trace: emails get forwarded; it stays in the admin.
 */
function alertMail(doc, { base, at = new Date(), account = '' }) {
  const subject = `[MTG] Lỗi máy chủ: ${String(doc.message || '').replace(/\s+/g, ' ').trim().slice(0, 120)}`;
  const mail = renderMail({
    lang: 'vi',
    subject,
    preheader: `${doc.where || ''} · ${doc.name}: ${doc.message}`.slice(0, 150),
    tag: { label: 'Lỗi máy chủ', tone: 'alert' },
    title: 'Website MTG vừa gặp một lỗi',
    intro: 'Lỗi đã được lưu trong Quản trị → Nhật ký lỗi, kèm chi tiết kỹ thuật.',
    fields: [
      ['Lỗi', `${doc.name}: ${doc.message}`],
      ['Ở đâu', doc.where || '(không rõ)'],
      ['Mã trạng thái', doc.status],
      ['Lúc', vnTime(at)],
      ['Lần đầu gặp', doc.firstAt ? vnTime(doc.firstAt) : ''],
      ['Số lần (90 ngày gần nhất)', doc.count],
      ['Tài khoản', account],
    ],
    button: { label: 'Mở Nhật ký lỗi', url: `${base}/admin/nhat-ky-loi` },
    notes: 'Lỗi này sẽ không gửi email lại trong 1 giờ tới; các lần sau vẫn được đếm trong trang Nhật ký lỗi.',
  });
  return { subject, ...mail };
}

/**
 * Logs one error. req (optional) gives the page and the user; where names a background job ("Retention") instead.
 * Returns a promise that always resolves (await it only before the process exits).
 */
function record(err, { req, where, status } = {}) {
  if (!(err instanceof Error)) err = new Error(String(err));
  console.error(where ? `${where}:` : '', err);
  // Database down: nothing can be saved, and the 503 page and the uptime monitor already cover it
  if (mongoose.connection.readyState !== 1 || isDbUnavailable(err)) return Promise.resolve();
  return save(err, { req, where, status })
    .then((doc) => doc && emailAlert(doc, req))
    .catch((e) => console.error('Error log: could not save or email the error above:', e.message));
}

/** Number of kinds of error not yet marked as seen (admin menu and dashboard) */
function unseenCount() {
  return ErrorLog.countDocuments({ seen: false });
}

module.exports = { record, unseenCount, kindKey, alertMail, EMAIL_EVERY_MS };
