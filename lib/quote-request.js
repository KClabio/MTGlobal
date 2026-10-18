// The request form's checks and values, shared by sending a request (routes/index.js) and changing one (routes/account.js)
const QuoteRequest = require('../models/QuoteRequest');
const { isNonEmpty, isValidEmail, isValidPhone } = require('./validators');

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
  return errors;
}

function readQuoteValues(req) {
  const field = (key) => (typeof req.body[key] === 'string' ? req.body[key].trim() : '');
  return {
    name: field('name'),
    phone: field('phone'),
    email: field('email'),
    schoolOrCompany: field('schoolOrCompany'),
    message: field('message'),
    interestedIn: QuoteRequest.INTERESTED_IN.includes(field('interestedIn')) ? field('interestedIn') : 'khac',
  };
}

module.exports = { validateQuoteRequest, readQuoteValues };
