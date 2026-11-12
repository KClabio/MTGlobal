#!/usr/bin/env node
// Sends one sample of each website email to an address, to check that an email account works and to see the emails
// as people will: the staff email for a new request, the same for a changed request, the sender's confirmation and
// the error alert (layout: lib/mail-layout.js). Made-up data; subjects start with [THỬ]. Nothing is saved anywhere.
//
//   node scripts/send-test-mails.js --to someone@example.com                          (account in .env)
//   node scripts/send-test-mails.js --to someone@example.com --env-file .env.mail-test (another account)
//
// The account: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (see .env.example). The password is never printed.
// The company phone and email in the confirmation come from the database (Thông tin công ty) when it can be reached.
const path = require('path');
const dotenv = require('dotenv');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const to = arg('to');
const envFile = arg('env-file');
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error('Usage: node scripts/send-test-mails.js --to <email address> [--env-file <file>]');
  process.exit(2);
}
dotenv.config({ quiet: true });
if (envFile) {
  const loaded = dotenv.config({ path: path.resolve(envFile), override: true, quiet: true });
  if (loaded.error) { console.error(`Can't read ${envFile}: ${loaded.error.message}`); process.exit(2); }
}
delete process.env.MAIL_TEST_DIR; // this script sends for real
if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
  console.error(`No email account: set SMTP_HOST, SMTP_USER and SMTP_PASS in ${envFile || '.env'} (see .env.example).`);
  process.exit(2);
}

const mongoose = require('mongoose');
const mailer = require('../lib/mailer');
const { staffMail, senderMail } = require('../lib/request-mail');
const { alertMail } = require('../lib/error-log');

const base = (process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, '');

async function companyContacts() {
  if (!process.env.MONGO_URI) return {};
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 3000 });
    const SiteSettings = require('../models/SiteSettings');
    const s = await SiteSettings.findOne().lean();
    return (s && s.contactInfo) || {};
  } catch {
    return {};
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

async function main() {
  const contactInfo = await companyContacts();
  const now = new Date();
  const request = {
    name: 'Nguyễn Văn Thử', phone: '0912 345 678', email: to, schoolOrCompany: 'Trường THCS Mẫu (dữ liệu thử)',
    interestedIn: 'san-pham-robot', details: [{ labelVi: 'Sản phẩm', valueVi: 'Robot cắt cỏ' }],
    message: 'Đây là email thử của website MTG.\nXin báo giá 2 robot và lịch giới thiệu sản phẩm tại trường.',
    sourcePage: '/san-pham/robot-cat-co', createdAt: now, editedAt: now,
    _id: new mongoose.Types.ObjectId(), // a made-up request: its "Xác nhận yêu cầu" button opens "not found"
  };
  const error = {
    name: 'TypeError', message: "Cannot read properties of undefined (reading 'title') (lỗi thử)", where: 'GET /san-pham/robot-cat-co',
    status: 500, count: 3, firstAt: new Date(now - 26 * 60 * 60 * 1000),
  };
  const mails = [
    ['New request (to staff)', { replyTo: to, ...staffMail(request, { base, user: null, changed: false, pageName: 'Sản phẩm/Robot cắt cỏ' }) }],
    ['Changed request (to staff)', { replyTo: to, ...staffMail(request, { base, user: { email: to }, changed: true, pageName: 'Sản phẩm/Robot cắt cỏ' }) }],
    ['Confirmation (to the sender)', senderMail(request, { lang: 'vi', settings: { contactInfo }, base })],
    ['Error alert', alertMail(error, { base, at: now, account: 'Khách (không đăng nhập)' })],
  ];

  console.log(`From ${process.env.SMTP_FROM || process.env.SMTP_USER} through ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 465} to ${to}`);
  let failed = 0;
  for (const [what, mail] of mails) {
    try {
      const info = await mailer.sendMail({ ...mail, to, subject: `[THỬ] ${mail.subject}` });
      const ok = info && info.accepted && info.accepted.length && !(info.rejected || []).length;
      if (!ok) failed++;
      console.log(`${ok ? 'sent   ' : 'REFUSED'}  ${what}: ${(info && info.response) || 'no answer'}`);
    } catch (err) {
      failed++;
      console.log(`FAILED   ${what}: ${err.code || ''} ${err.message}`);
      if (err.code === 'EAUTH') { // the account itself was refused: the other emails would fail the same way
        console.log('The email account was refused (user name or password). For Gmail, SMTP_PASS must be an App password (myaccount.google.com/apppasswords), not the normal password.');
        failed = mails.length;
        break;
      }
    }
  }
  console.log(failed ? `${failed} of ${mails.length} not sent.` : `All ${mails.length} sent. Look in the inbox (and the spam folder) of ${to}.`);
  process.exit(failed ? 1 : 0);
}

main();
