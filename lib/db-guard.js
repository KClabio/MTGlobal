// While MongoDB is unreachable, pages answer at once with a short "temporarily unavailable" page (503, retry in 30 s)
// instead of waiting for the database: the session store and the page code would otherwise hang for many seconds.
// Placed after the files and /health in server.js, so pictures, styles and the health check keep working.
const mongoose = require('mongoose');

const RETRY_AFTER_SECONDS = 30;

/** Errors that mean "the database can't be reached" (not a bug in a page) */
function isDbUnavailable(err) {
  if (!err) return false;
  const name = `${err.name || ''} ${err.cause && err.cause.name ? err.cause.name : ''}`;
  return /MongoServerSelectionError|MongooseServerSelectionError|MongoNetworkError|MongoNotConnectedError|MongoTopologyClosedError/.test(name)
    || /buffering timed out/i.test(err.message || '');
}

function sendUnavailable(res) {
  res.status(503).set('Retry-After', String(RETRY_AFTER_SECONDS)).set('Cache-Control', 'no-store').render('503');
}

/** connection: anything with a readyState (1 = connected); the mongoose connection by default */
function dbGuard(connection = mongoose.connection) {
  return function (req, res, next) {
    if (connection.readyState === 1) return next();
    sendUnavailable(res);
  };
}

module.exports = { dbGuard, isDbUnavailable, sendUnavailable, RETRY_AFTER_SECONDS };
