// "Quên mật khẩu": a one-time email link to choose a new password.
//  - The link holds a random token; only its hash is stored, so reading the database gives no working link.
//  - It works for LINK_MINUTES and once; a newer link replaces an older one.
//  - The answer on the page is the same whether or not the email has an account.
//  - Limits (lib/request-throttle.js): 3 emails an hour to one address, so the form can't fill a stranger's inbox, and
//    10 requests an hour from one visitor address.
//  - On the live server the address in the link comes from SITE_URL only, never from the request.
//  - A new password doesn't skip staff two-step login: that comes after the password as usual.
const crypto = require('crypto');
const User = require('../models/User');
const mailer = require('./mailer');
const errorLog = require('./error-log');
const requestThrottle = require('./request-throttle');
const { makeTranslator } = require('./i18n');
const { siteBase } = require('./sitemap');

const LINK_MINUTES = 60;
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const looksLikeToken = (token) => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);

/** Emails can be sent, and on the live server the link's address is known */
function canSend(env = process.env) {
  if (!mailer.isConfigured(env)) return false;
  return env.NODE_ENV !== 'production' || /^https?:\/\/[^/\s]+/i.test(String(env.SITE_URL || '').trim());
}

function resetLink(req, token, env = process.env) {
  return `${siteBase(req, env.SITE_URL)}/dat-lai-mat-khau/${token}`;
}

function resetMail({ link, lang }) {
  const t = makeTranslator(lang);
  return {
    subject: t('resetMail.subject'),
    text: [t('resetMail.hello'), '', t('resetMail.intro'), link, '', t('resetMail.expires', { minutes: LINK_MINUTES }), t('resetMail.notYou'), '', t('requestMail.signature')].join('\n'),
  };
}

function changedMail({ lang }) {
  const t = makeTranslator(lang);
  return {
    subject: t('resetMail.changedSubject'),
    text: [t('resetMail.hello'), '', t('resetMail.changed'), t('resetMail.changedNotYou'), '', t('requestMail.signature')].join('\n'),
  };
}

async function sendLink(email, { req, lang }) {
  if (!(await requestThrottle.take('resetAddress', req.ip))) return;
  const user = await User.findOne({ email }).select('_id').lean();
  if (!user) return;
  if (!(await requestThrottle.take('resetEmail', email))) return;
  const token = crypto.randomBytes(32).toString('hex');
  await User.updateOne({ _id: user._id }, { $set: { passwordReset: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + LINK_MINUTES * 60000) } } });
  await mailer.sendMail({ to: email, ...resetMail({ link: resetLink(req, token), lang }) });
}

/** Not awaited by the page, so the time it takes doesn't show whether the account exists */
function requestLink(email, opts) {
  sendLink(email, opts).catch((err) => errorLog.record(err, { req: opts.req, where: 'Password reset email' }));
}

/** Whether the link still works */
async function linkWorks(token) {
  if (!looksLikeToken(token)) return false;
  return !!(await User.exists({ 'passwordReset.tokenHash': hashToken(token), 'passwordReset.expiresAt': { $gt: new Date() } }));
}

/** Uses the link once (two tries at the same moment can't both succeed): the user, or null when it no longer works */
async function useLink(token, passwordHash) {
  if (!looksLikeToken(token)) return null;
  return User.findOneAndUpdate(
    { 'passwordReset.tokenHash': hashToken(token), 'passwordReset.expiresAt': { $gt: new Date() } },
    { $set: { passwordHash }, $unset: { passwordReset: 1 } },
    { returnDocument: 'after' },
  ).lean();
}

function tellPasswordChanged(user, { req, lang }) {
  mailer.sendMail({ to: user.email, ...changedMail({ lang }) }).catch((err) => errorLog.record(err, { req, where: 'Password changed email' }));
}

module.exports = { canSend, resetLink, resetMail, changedMail, requestLink, linkWorks, useLink, tellPasswordChanged, hashToken, LINK_MINUTES };
