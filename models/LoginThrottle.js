const mongoose = require('mongoose');

// Wrong-password counts for the login limit (lib/login-throttle.js). _id is "email:<address>" or "ip:<address>".
// MongoDB deletes each record by itself once it has expired (TTL index on expiresAt).
const loginThrottleSchema = new mongoose.Schema({
  _id: { type: String },
  fails: { type: Number, default: 0 },
  windowStart: { type: Date, default: null },
  lockedUntil: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
}, { versionKey: false });

loginThrottleSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('LoginThrottle', loginThrottleSchema);
