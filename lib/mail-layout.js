// One layout for the website's emails (lib/request-mail.js: request to staff + sender's confirmation; lib/error-log.js:
// error alert). Every email has the same parts, in the same order, both as HTML and as a plain-text copy:
//   MTG bar · tag (what kind of email) · title · intro lines · a table of details · a quoted block of typed text ·
//   one button · small notes · signature · footer (optional: the confirmation's "please don't reply"; staff emails have none).
// HTML for mail apps: tables and inline styles only (Gmail drops <style>), no pictures (they'd be blocked or broken),
// and every value is escaped: names, messages and error messages come from visitors.
const crypto = require('crypto');
const { escapeHtml } = require('./text');

const C = { blue: '#1565c0', navy: '#1f2a37', ink: '#1a202c', muted: '#5b6774', line: '#e2e8f0', wash: '#f5f7fa', white: '#ffffff' };
const TONES = { info: ['#e8f1fc', '#0d47a1'], ok: ['#e6f4ea', '#1e6b30'], warn: ['#fdf0e2', '#9a4a00'], alert: ['#fdecea', '#b3261e'] };
const FONT = "'Be Vietnam Pro', 'Segoe UI', Arial, Helvetica, sans-serif";

const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
// Gmail groups emails with the same subject and hides ("•••", trimmed content) the end of a new one when it matches
// the earlier ones: the button and notes of a second error alert disappeared. An invisible mark that differs in every
// email keeps its end from matching.
const uniqueMark = () => `${Date.now().toString(36)}${crypto.randomBytes(6).toString('hex')}`;
const html = (text) => escapeHtml(String(text)).replace(/\r?\n/g, '<br>');

function htmlPart(m) {
  const tone = TONES[m.tag && m.tag.tone] || TONES.info;
  const p = (text, style = '') => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${C.ink};${style}">${html(text)}</p>`;
  const parts = [];
  if (m.tag) parts.push(`<p style="margin:0 0 10px"><span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${tone[0]};color:${tone[1]};font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase">${html(m.tag.label)}</span></p>`);
  if (m.title) parts.push(`<h1 style="margin:0 0 14px;font-size:21px;line-height:1.35;color:${C.navy};font-weight:700">${html(m.title)}</h1>`);
  m.intro.forEach((line) => parts.push(p(line)));
  if (m.fields.length) {
    if (m.fieldsTitle) parts.push(`<p style="margin:18px 0 6px;font-size:13px;font-weight:700;color:${C.muted};text-transform:uppercase;letter-spacing:.05em">${html(m.fieldsTitle)}</p>`);
    const rows = m.fields.map(([label, value], i) => `<tr><td valign="top" style="padding:9px 12px;width:36%;font-size:14px;color:${C.muted};${i ? `border-top:1px solid ${C.line};` : ''}">${html(label)}</td><td valign="top" style="padding:9px 12px;font-size:15px;color:${C.ink};font-weight:600;word-break:break-word;${i ? `border-top:1px solid ${C.line};` : ''}">${html(value)}</td></tr>`).join('');
    parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 16px;border-collapse:separate;background:${C.wash};border:1px solid ${C.line};border-radius:8px">${rows}</table>`);
  }
  if (m.block) {
    parts.push(`<p style="margin:18px 0 6px;font-size:13px;font-weight:700;color:${C.muted};text-transform:uppercase;letter-spacing:.05em">${html(m.block.label)}</p>`);
    parts.push(`<div style="margin:0 0 16px;padding:12px 16px;border-left:4px solid ${C.blue};background:${C.wash};font-size:15px;line-height:1.6;color:${C.ink};word-break:break-word">${html(m.block.text)}</div>`);
  }
  if (m.button) {
    parts.push(`<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 18px"><tr><td style="border-radius:6px;background:${C.blue}"><a href="${escapeHtml(m.button.url)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:700;color:${C.white};text-decoration:none;border-radius:6px">${html(m.button.label)}</a></td></tr></table>`);
  }
  m.notes.forEach((line) => parts.push(`<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:${C.muted}">${html(line)}</p>`));
  if (m.signature) parts.push(p(m.signature, 'margin-top:18px'));

  const footer = m.footer.map((line) => `<p style="margin:0 0 4px">${html(line)}</p>`).join('')
    + (m.siteUrl ? `<p style="margin:0"><a href="${escapeHtml(m.siteUrl)}" style="color:${C.blue};text-decoration:none">${html(m.siteUrl.replace(/^https?:\/\//, ''))}</a></p>` : '');

  return `<!doctype html>
<html lang="${m.lang === 'en' ? 'en' : 'vi'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${html(m.subject || m.title || 'MTG')}</title></head>
<body style="margin:0;padding:0;background:${C.wash};font-family:${FONT}">
${m.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${html(m.preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.wash}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${C.white};border:1px solid ${C.line};border-radius:10px;font-family:${FONT}">
<tr><td style="background:${C.blue};padding:16px 24px;border-radius:10px 10px 0 0;color:${C.white};font-size:19px;font-weight:800;letter-spacing:.02em">MTG <span style="font-weight:400;font-size:15px;opacity:.9">· Mễ Trì Global</span></td></tr>
<tr><td style="padding:24px">${parts.join('\n')}</td></tr>
${footer ? `<tr><td style="padding:14px 24px 18px;border-top:1px solid ${C.line};font-size:12px;line-height:1.5;color:${C.muted}">${footer}</td></tr>\n` : ''}</table></td></tr></table>
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;line-height:1px;color:${C.wash};opacity:0" aria-hidden="true">${uniqueMark()}</div>
</body></html>`;
}

function textPart(m) {
  const out = m.intro.flatMap((line, i) => (i ? ['', line] : [line]));
  if (m.fields.length) {
    out.push('');
    if (m.fieldsTitle) out.push(m.fieldsTitle);
    m.fields.forEach(([label, value]) => out.push(`${label}: ${value}`));
  }
  if (m.block) out.push('', `${m.block.label}:`, m.block.text);
  if (m.button) out.push('', `${m.button.label}: ${m.button.url}`);
  if (m.notes.length) out.push('', ...m.notes);
  if (m.signature) out.push('', m.signature);
  if (m.footer.length || m.siteUrl) out.push('', '--', ...m.footer, ...(m.siteUrl ? [m.siteUrl] : []));
  return out.join('\n');
}

/**
 * Builds one email. Every option but lang is optional; fields with an empty value are left out.
 * @returns {{ html: string, text: string }}
 */
function renderMail({ lang = 'vi', subject, preheader, tag, title, intro = [], fieldsTitle, fields = [], block, button, notes = [], signature, footer = [], siteUrl } = {}) {
  const m = {
    lang, subject, preheader, tag, title, fieldsTitle, signature, siteUrl,
    intro: [].concat(intro).filter(has),
    fields: fields.filter((f) => f && has(f[1])),
    block: block && has(block.text) ? block : null,
    button: button && has(button.url) ? button : null,
    notes: [].concat(notes).filter(has),
    footer: [].concat(footer).filter(has),
  };
  return { html: htmlPart(m), text: textPart(m) };
}

module.exports = { renderMail };
