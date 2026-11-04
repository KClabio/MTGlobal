const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-.\s]{8,20}$/;

function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_RE.test(value.trim());
}

function isValidPhone(value) {
  return typeof value === 'string' && PHONE_RE.test(value.trim());
}

function isNonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// What a form may send is decided here, not by what arrives: a browser form sends each of these fields once, as text.
// A field sent twice or with [brackets] becomes its first text, or empty. Fields the page keeps as lists or files
// (`stored`: photos, videos, specifications) are never taken from the text of the form.
function cleanForm(body, { text = [], stored = [] }) {
  for (const field of text) {
    const value = body[field];
    if (value === undefined || typeof value === 'string') continue;
    body[field] = Array.isArray(value) ? value.find((v) => typeof v === 'string') || '' : '';
  }
  for (const field of stored) delete body[field];
  return body;
}

module.exports = { isValidEmail, isValidPhone, isNonEmpty, cleanForm };
