const express = require('express');
const router = express.Router();

const QuoteRequest = require('../models/QuoteRequest');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/', async (req, res) => {
  const requests = await QuoteRequest.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
  res.render('my-requests', { requests });
});

module.exports = router;
