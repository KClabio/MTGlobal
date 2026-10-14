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

module.exports = { isValidEmail, isValidPhone, isNonEmpty };
