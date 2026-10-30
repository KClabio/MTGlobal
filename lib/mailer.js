// Sends the site's emails (error alerts: lib/error-log.js; new requests: lib/request-mail.js) through the SMTP account in .env
// (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS; see .env.example). Without them no email is sent, and nothing breaks.
// Tests set MAIL_TEST_DIR instead: each email is then written there as a JSON file, never sent.
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

let transport = null;

function isConfigured(env = process.env) {
  return !!(env.MAIL_TEST_DIR || (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS));
}

function getTransport(env = process.env) {
  if (transport) return transport;
  if (env.MAIL_TEST_DIR) {
    transport = nodemailer.createTransport({ jsonTransport: true });
  } else {
    const port = Number(env.SMTP_PORT) || 465;
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port,
      secure: port === 465, // 465: encrypted from the start; 587: upgraded to encryption (STARTTLS)
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return transport;
}

/** Sends one email (replyTo: where "Reply" goes); returns true when it went out (or was written, in tests) */
async function sendMail({ to, subject, text, replyTo }, env = process.env) {
  if (!isConfigured(env) || !to || (Array.isArray(to) && !to.length)) return false;
  const info = await getTransport(env).sendMail({ from: env.SMTP_FROM || env.SMTP_USER || 'MTG <no-reply@localhost>', to, subject, text, ...(replyTo ? { replyTo } : {}) });
  if (env.MAIL_TEST_DIR) {
    await fs.promises.mkdir(env.MAIL_TEST_DIR, { recursive: true });
    await fs.promises.writeFile(path.join(env.MAIL_TEST_DIR, `${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}.json`), info.message);
  }
  return true;
}

module.exports = { isConfigured, sendMail };
