// Emails for a new or changed request (routes/index.js, routes/account.js), in the MTG layout (lib/mail-layout.js),
// sent through lib/mailer.js:
//  - to staff: every address in Admin → Cài đặt chung → "Email nhận yêu cầu", with the whole request. "Trả lời"
//    (Reply) answers the sender straight away (Reply-To); "Xác nhận yêu cầu" opens Admin → Yêu cầu → Xác nhận.
//    Never waited for and never throws: a failed email goes to Admin → Nhật ký lỗi, and the request is saved anyway.
//  - to the sender, only when staff press "Gửi email xác nhận" on that page (routes/admin.js): "Đã nhận yêu cầu", in
//    the language the request was sent in. It holds no text typed into the form (not even the name).
const mailer = require('./mailer');
const errorLog = require('./error-log');
const { getSiteSettings } = require('./settings');
const { makeTranslator } = require('./i18n');
const { siteBase } = require('./sitemap');
const { renderMail } = require('./mail-layout');
const Product = require('../models/Product');
const Service = require('../models/Service');

const STAFF_EMAILS_MAX = 10;

const oneLine = (text) => String(text || '').replace(/\s+/g, ' ').trim();
const when = (date, lang) => new Date(date || Date.now()).toLocaleString(lang === 'en' ? 'en-GB' : 'vi-VN',
  { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * The page a request was sent from, as people name it (always Vietnamese: it goes to staff):
 * "/san-pham/robot-cat-co" → "Sản phẩm/Robot cắt cỏ", "/dich-vu/tu-van-du-hoc" → "Dịch vụ/Tư vấn du học", "/lien-he" →
 * "Liên hệ". The current name is read from the database; a page that no longer exists keeps its address.
 */
async function pageName(path) {
  const address = String(path || '');
  if (!address) return '(không rõ)';
  if (address === '/lien-he') return 'Liên hệ';
  try {
    let m = address.match(/^\/san-pham\/([^/]+)$/);
    if (m) {
      const product = await Product.findOne({ category: m[1] }).select('nameVi nameEn').lean();
      if (product && (product.nameVi || product.nameEn)) return `Sản phẩm/${product.nameVi || product.nameEn}`;
    }
    m = address.match(/^\/dich-vu\/([^/]+)$/);
    if (m) {
      const service = await Service.findOne({ slug: m[1] }).select('titleVi titleEn').lean();
      if (service && (service.titleVi || service.titleEn)) return `Dịch vụ/${service.titleVi || service.titleEn}`;
    }
  } catch {
    // no database for a moment: the address is still clear enough
  }
  return address;
}

function staffMail(request, { base, user, changed, pageName: page }) {
  const t = makeTranslator('vi');
  const category = t(`admin.interest.${request.interestedIn}`);
  const none = '(không có)';
  const subject = oneLine(`[MTG] ${changed ? 'Yêu cầu đã sửa' : 'Yêu cầu mới'}: ${category} – ${request.name}`).slice(0, 200);
  const mail = renderMail({
    lang: 'vi',
    subject,
    preheader: `${request.name} · ${category}`,
    tag: changed ? { label: 'Yêu cầu đã sửa', tone: 'warn' } : { label: 'Yêu cầu mới', tone: 'info' },
    title: changed ? 'Yêu cầu tư vấn đã được sửa' : 'Yêu cầu tư vấn mới',
    intro: changed ? 'Người gửi vừa sửa lại một yêu cầu tư vấn.' : 'Website MTG vừa nhận một yêu cầu tư vấn mới.',
    fields: [
      ['Họ và tên', request.name],
      ['Số điện thoại', request.phone || none],
      ['Email', request.email || none],
      ['Trường / Đơn vị', request.schoolOrCompany || none],
      ['Quan tâm', category],
      ...(request.details || []).map((d) => [d.labelVi || d.labelEn, d.valueVi || d.valueEn]),
    ],
    block: { label: 'Nội dung', text: request.message },
    buttons: [
      { label: 'Xem trong trang quản trị', url: `${base}/admin/yeu-cau` },
      // Opens Admin → Yêu cầu → Xác nhận (staff login needed); the email to the customer is only sent from there
      ...(request.email && request._id ? [{ label: 'Xác nhận yêu cầu', url: `${base}/admin/yeu-cau/${request._id}/xac-nhan`, tone: 'ok' }] : []),
    ],
    notes: [
      `Gửi từ trang: ${page || request.sourcePage || '(không rõ)'}`,
      `Tài khoản: ${user ? user.email : 'Khách (không đăng nhập)'}`,
      `Lúc: ${when(changed ? request.editedAt : request.createdAt, 'vi')}`,
      request.email
        ? 'Bấm "Xác nhận yêu cầu" để gửi email báo cho khách rằng MTG đã nhận yêu cầu; bấm "Trả lời" để trả lời thẳng cho khách.'
        : 'Khách không để lại email: liên hệ qua số điện thoại.',
    ],
  });
  return { subject, ...mail };
}

function senderMail(request, { lang, settings, base }) {
  const t = makeTranslator(lang);
  const info = (settings && settings.contactInfo) || {};
  const subject = t('requestMail.subject');
  // Only translated lines, the category, the time and the company's own contacts: never text typed into the form
  const mail = renderMail({
    lang,
    subject,
    preheader: t('requestMail.reply'),
    tag: { label: t('requestMail.tag'), tone: 'ok' },
    title: t('requestMail.title'),
    intro: [
      t('requestMail.hello'),
      t('requestMail.received', { category: t(`forms.interest.${request.interestedIn}`), time: when(request.createdAt, lang) }),
      t('requestMail.reply'),
    ],
    fieldsTitle: t('requestMail.contactTitle'),
    fields: [
      [t('requestMail.phone'), info.phone],
      [t('requestMail.email'), info.email],
    ],
    button: { label: t('requestMail.button'), url: base },
    notes: t('requestMail.notYou'),
    signature: t('requestMail.signature'),
    footer: t('requestMail.footer'),
  });
  return { subject, ...mail };
}

async function sendToStaff(request, { req, user = null }, changed) {
  if (!mailer.isConfigured()) return;
  const settings = await getSiteSettings();
  const staff = (settings.requestEmails || []).filter(Boolean).slice(0, STAFF_EMAILS_MAX);
  if (!staff.length) return;
  const page = await pageName(request.sourcePage);
  await mailer.sendMail({ to: staff, replyTo: request.email || undefined, ...staffMail(request, { base: siteBase(req), user, changed, pageName: page }) });
}

function notify(request, opts, changed) {
  sendToStaff(request, opts, changed).catch((err) => errorLog.record(err, { req: opts.req, where: 'Email for a request not sent (to staff)' }));
}

/** A request was just sent: tell staff (the sender hears from MTG once staff confirm it: sendConfirmation) */
const notifyNewRequest = (request, opts) => notify(request, opts, false);
/** The sender changed a request ("Yêu cầu của tôi" → Sửa): tell staff */
const notifyChangedRequest = (request, opts) => notify(request, opts, true);

/** The customer's "Đã nhận yêu cầu" email, in the language they used, ready to send (also shown on the confirm page) */
async function confirmationFor(request, { req }) {
  return senderMail(request, { lang: request.lang === 'en' ? 'en' : 'vi', settings: await getSiteSettings(), base: siteBase(req) });
}

/**
 * Staff pressed "Gửi email xác nhận" (Admin → Yêu cầu → Xác nhận): sends the customer's email now and waits for it.
 * Throws when it can't be sent (no email account, no address, the mail server refused), so the page can say so.
 */
async function sendConfirmation(request, { req }) {
  if (!request.email) throw new Error('This request has no email address');
  if (!mailer.isConfigured()) throw new Error('No email account on the server (SMTP_ settings)');
  return mailer.sendMail({ to: request.email, ...(await confirmationFor(request, { req })) });
}

module.exports = { notifyNewRequest, notifyChangedRequest, sendConfirmation, confirmationFor, staffMail, senderMail, pageName, STAFF_EMAILS_MAX };
