const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const QuoteRequest = require('../models/QuoteRequest');
const { requireAuth } = require('../middleware/auth');
const { validateQuoteRequest, readQuoteValues } = require('../lib/quote-request');

router.use(requireAuth);

// ?da-sua=<id>: just changed (green note, that row highlighted); ?khoa=1: tried to change one staff already handle
router.get('/', async (req, res) => {
  const requests = await QuoteRequest.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
  res.render('my-requests', { requests, editedId: req.query['da-sua'] || null, locked: req.query.khoa === '1' });
});

// ---- Changing a sent request: only the sender, and only while it is "Mới" (staff haven't acted yet) ----
const EDITABLE = 'moi';

async function ownRequest(req) {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  return QuoteRequest.findOne({ _id: req.params.id, user: req.user._id }).lean();
}

function renderEdit(res, request, { status = 200, values = null, errors = {}, error = null } = {}) {
  res.status(status).render('request-edit', { request, values: values || request, errors, error });
}

router.get('/yeu-cau/:id/sua', async (req, res) => {
  const request = await ownRequest(req);
  if (!request) return res.status(404).render('404');
  if (request.status !== EDITABLE) return res.redirect(303, '/tai-khoan?khoa=1');
  renderEdit(res, request);
});

router.post('/yeu-cau/:id/sua', async (req, res) => {
  const request = await ownRequest(req);
  if (!request) return res.status(404).render('404');
  if (request.status !== EDITABLE) return res.redirect(303, '/tai-khoan?khoa=1'); // staff may have moved it meanwhile

  // A robot or service request keeps its category and its lines (robot, package, answers) as sent
  const values = readQuoteValues(req);
  if (request.details && request.details.length) values.interestedIn = request.interestedIn;
  const errors = validateQuoteRequest(values, res.locals.t);
  if (Object.keys(errors).length) {
    return renderEdit(res, request, { status: 400, values, errors, error: res.locals.t('forms.errSummary') });
  }

  const { name, phone, email, schoolOrCompany, message, interestedIn } = values;
  const updated = await QuoteRequest.updateOne(
    { _id: request._id, user: req.user._id, status: EDITABLE },
    { $set: { name, phone, email, schoolOrCompany, message, interestedIn, editedAt: new Date(), privacyAcceptedAt: new Date() } },
  );
  if (!updated.matchedCount) return res.redirect(303, '/tai-khoan?khoa=1');
  res.redirect(303, `/tai-khoan?da-sua=${request._id}`);
});

module.exports = router;
