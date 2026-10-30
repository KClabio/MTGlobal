// Emails for a new or changed request (routes/index.js, routes/account.js), sent through lib/mailer.js:
//  - to staff: every address in Admin → Cài đặt chung → "Email nhận yêu cầu", with the whole request. "Trả lời"
//    (Reply) answers the sender straight away (Reply-To).
//  - to the sender, only for a new request that has an email: a short confirmation in the page's language. It holds no
//    text typed into the form (not even the name), so nobody can use the form to send their own words to a stranger,
//    and one address gets at most 3 a day (lib/request-throttle.js).
// Never waited for and never throws: a failed email goes to Admin → Nhật ký lỗi, and the request is saved anyway.
const mailer = require('./mailer');
const errorLog = require('./error-log');
const requestThrottle = require('./request-throttle');
const { getSiteSettings } = require('./settings');
const { makeTranslator } = require('./i18n');
const { siteBase } = require('./sitemap');

const STAFF_EMAILS_MAX = 10;

const oneLine = (text) => String(text || '').replace(/\s+/g, ' ').trim();
const when = (date, lang) => new Date(date || Date.now()).toLocaleString(lang === 'en' ? 'en-GB' : 'vi-VN',
  { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function staffMail(request, { base, user, changed }) {
  const t = makeTranslator('vi');
  const category = t(`admin.interest.${request.interestedIn}`);
  const none = '(không có)';
  const lines = [
    changed ? 'Người gửi vừa sửa lại một yêu cầu tư vấn.' : 'Website MTG vừa nhận một yêu cầu tư vấn mới.',
    '',
    `Họ và tên: ${request.name}`,
    `Số điện thoại: ${request.phone || none}`,
    `Email: ${request.email || none}`,
    `Trường / Đơn vị: ${request.schoolOrCompany || none}`,
    `Quan tâm: ${category}`,
    ...(request.details || []).map((d) => `${d.labelVi || d.labelEn}: ${d.valueVi || d.valueEn}`),
    '',
    'Nội dung:',
    request.message,
    '',
    `Gửi từ trang: ${request.sourcePage || '(không rõ)'}`,
    `Tài khoản: ${user ? user.email : 'Khách (không đăng nhập)'}`,
    `Lúc: ${when(changed ? request.editedAt : request.createdAt, 'vi')}`,
    '',
    `Xem trong trang quản trị: ${base}/admin/yeu-cau`,
    ...(request.email ? ['', 'Bấm "Trả lời" để trả lời thẳng cho người gửi.'] : []),
  ];
  return {
    subject: oneLine(`[MTG] ${changed ? 'Yêu cầu đã sửa' : 'Yêu cầu mới'}: ${category} – ${request.name}`).slice(0, 200),
    text: lines.join('\n'),
  };
}

function senderMail(request, { lang, settings, base }) {
  const t = makeTranslator(lang);
  const info = (settings && settings.contactInfo) || {};
  const lines = [
    t('requestMail.hello'),
    '',
    t('requestMail.received', { category: t(`forms.interest.${request.interestedIn}`), time: when(request.createdAt, lang) }),
    t('requestMail.reply'),
    '',
    ...(info.phone ? [t('requestMail.phone', { phone: info.phone })] : []),
    ...(info.email ? [t('requestMail.email', { email: info.email })] : []),
    t('requestMail.site', { url: base }),
    '',
    t('requestMail.notYou'),
    '',
    t('requestMail.signature'),
  ];
  return { subject: t('requestMail.subject'), text: lines.join('\n') };
}

async function send(request, { req, lang = 'vi', user = null }, changed) {
  if (!mailer.isConfigured()) return;
  const settings = await getSiteSettings();
  const base = siteBase(req);
  const jobs = [];
  const staff = (settings.requestEmails || []).filter(Boolean).slice(0, STAFF_EMAILS_MAX);
  if (staff.length) {
    jobs.push(['staff', mailer.sendMail({ to: staff, replyTo: request.email || undefined, ...staffMail(request, { base, user, changed }) })]);
  }
  if (!changed && request.email && (await requestThrottle.take('confirmation', request.email))) {
    jobs.push(['sender', mailer.sendMail({ to: request.email, ...senderMail(request, { lang, settings, base }) })]);
  }
  const results = await Promise.allSettled(jobs.map(([, job]) => job));
  results.forEach((r, i) => {
    if (r.status === 'rejected') errorLog.record(r.reason, { req, where: `Email for a request not sent (${jobs[i][0] === 'staff' ? 'to staff' : 'confirmation to the sender'})` });
  });
}

function notify(request, opts, changed) {
  send(request, opts, changed).catch((err) => errorLog.record(err, { req: opts.req, where: 'Emails for a request not sent' }));
}

/** A request was just sent: tell staff, and confirm to the sender */
const notifyNewRequest = (request, opts) => notify(request, opts, false);
/** The sender changed a request ("Yêu cầu của tôi" → Sửa): tell staff */
const notifyChangedRequest = (request, opts) => notify(request, opts, true);

module.exports = { notifyNewRequest, notifyChangedRequest, staffMail, senderMail, STAFF_EMAILS_MAX };
