const mongoose = require('mongoose');

// Server errors (lib/error-log.js), one record per kind of error: the same error again only adds to its count.
// Shown in Admin → Nhật ký lỗi. No form contents, cookies or emails are kept (only the page address and the user id).
// MongoDB deletes a record by itself 90 days after the error last happened (TTL index on lastAt).
const KEEP_DAYS = 90;

const errorLogSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true }, // hash of name + message + first stack line
  name: { type: String, default: 'Error' },
  message: { type: String, default: '' },
  stack: { type: String, default: '' },
  where: { type: String, default: '' }, // a page "GET /tin-tuc/abc", or a background job ("Retention")
  status: { type: Number, default: 500 },
  userId: { type: mongoose.Schema.Types.ObjectId, default: null },
  count: { type: Number, default: 0 },
  firstAt: { type: Date, default: Date.now },
  lastAt: { type: Date, default: Date.now },
  lastEmailAt: { type: Date, default: null },
  seen: { type: Boolean, default: false },
}, { versionKey: false });

errorLogSchema.index({ lastAt: 1 }, { expireAfterSeconds: KEEP_DAYS * 24 * 60 * 60 });
errorLogSchema.index({ seen: 1 });

module.exports = mongoose.model('ErrorLog', errorLogSchema);
module.exports.KEEP_DAYS = KEEP_DAYS;
