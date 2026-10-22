// Requests are kept 24 months after their last change, then deleted automatically (owner's choice, 22 Oct 2026;
// stated in the Chính sách bảo mật, lib/privacy-policy.js). Runs once when the site starts, then once a day.
const QuoteRequest = require('../models/QuoteRequest');

const REQUEST_KEEP_MONTHS = 24;
const DAY_MS = 24 * 60 * 60 * 1000;

function requestCutoff(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - REQUEST_KEEP_MONTHS);
  return cutoff;
}

// Returns how many requests were deleted
async function deleteOldRequests(now = new Date()) {
  const { deletedCount } = await QuoteRequest.deleteMany({ updatedAt: { $lt: requestCutoff(now) } });
  return deletedCount;
}

function startRetention() {
  const run = () => deleteOldRequests()
    .then((count) => { if (count) console.log(`Retention: deleted ${count} request(s) older than ${REQUEST_KEEP_MONTHS} months`); })
    .catch((err) => console.error('Retention: old requests not deleted (tried again tomorrow):', err.message));
  run();
  setInterval(run, DAY_MS).unref();
}

module.exports = { REQUEST_KEEP_MONTHS, requestCutoff, deleteOldRequests, startRetention };
