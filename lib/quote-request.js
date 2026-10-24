// The request form's checks and values, shared by sending a request (routes/index.js) and changing one (routes/account.js)
const QuoteRequest = require('../models/QuoteRequest');
const { isNonEmpty, isValidEmail, isValidPhone } = require('./validators');

// The longest message a request may carry (the box counts down to it: partials/quote-form.ejs)
const MESSAGE_MAX = 3000;

// Gatekeeping for the request form: name and message required, plus at least one valid way to reach the sender
function validateQuoteRequest(values, t) {
  const errors = {};
  if (!isNonEmpty(values.name)) errors.name = t('forms.errName');
  if (!values.phone && !values.email) {
    errors.contact = t('forms.errContact');
  } else {
    if (values.phone && !isValidPhone(values.phone)) errors.phone = t('forms.errPhone');
    if (values.email && !isValidEmail(values.email)) errors.email = t('forms.errEmail');
  }
  if (!isNonEmpty(values.message)) errors.message = t('forms.errMessage');
  else if (values.message.length > MESSAGE_MAX) errors.message = t('forms.errMessageLength');
  if (!values.agreePrivacy) errors.agreePrivacy = t('privacy.errAgree'); // consent to the Chính sách bảo mật (Decree 13)
  return errors;
}

function readQuoteValues(req) {
  const field = (key) => (typeof req.body[key] === 'string' ? req.body[key].trim() : '');
  return {
    name: field('name'),
    phone: field('phone'),
    email: field('email'),
    schoolOrCompany: field('schoolOrCompany'),
    message: field('message').replace(/\r\n?/g, '\n'), // forms send \r\n: store \n, so the length matches the box's own count
    interestedIn: QuoteRequest.INTERESTED_IN.includes(field('interestedIn')) ? field('interestedIn') : 'khac',
    agreePrivacy: field('agreePrivacy') !== '', // the "Tôi đồng ý với Chính sách bảo mật" tick
  };
}

module.exports = { validateQuoteRequest, readQuoteValues, MESSAGE_MAX };
