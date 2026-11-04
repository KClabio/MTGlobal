// Logs a user out everywhere. connect-mongo stores each session as a JSON string, so the sessions are found by the
// text of their user id. Also ends a staff login that is half-way through the two-step code.
const mongoose = require('mongoose');

function endAllSessions(userId) {
  return mongoose.connection.collection('sessions').deleteMany({ session: { $regex: `"userId":"${userId}"` } });
}

module.exports = { endAllSessions };
