// Requests are kept 24 months after their last change, then deleted automatically (owner's choice, 22 Oct 2026;
// stated in the Chính sách bảo mật, lib/privacy-policy.js). The visit counts (models/PageView.js) are kept as long.
// Runs once when the site starts, then once a day.
const QuoteRequest = require('../models/QuoteRequest');
const PageView = require('../models/PageView');
const errorLog = require('./error-log');

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

// Visit counts of days before the same cutoff ('YYYY-MM-DD' strings compare in date order)
async function deleteOldPageViews(now = new Date()) {
  const { deletedCount } = await PageView.deleteMany({ day: { $lt: requestCutoff(now).toISOString().slice(0, 10) } });
  return deletedCount;
}

function startRetention() {
  const run = () => deleteOldRequests()
    .then((count) => { if (count) console.log(`Retention: deleted ${count} request(s) older than ${REQUEST_KEEP_MONTHS} months`); })
    .catch((err) => errorLog.record(err, { where: 'Retention: old requests not deleted (tried again tomorrow)' }))
    .then(() => deleteOldPageViews())
    .catch((err) => errorLog.record(err, { where: 'Retention: old visit counts not deleted (tried again tomorrow)' }));
  run();
  setInterval(run, DAY_MS).unref();
}

module.exports = { REQUEST_KEEP_MONTHS, requestCutoff, deleteOldRequests, deleteOldPageViews, startRetention };
