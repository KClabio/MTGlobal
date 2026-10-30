const mongoose = require('mongoose');

// Visits per public page and day, for the admin overview's "Lượt xem trang" (lib/page-views.js). Only a count:
// no address, cookie or visitor id, so nothing here is personal data. Deleted after 24 months (lib/retention.js).
const pageViewSchema = new mongoose.Schema({
  day: { type: String, required: true }, // 'YYYY-MM-DD', Vietnam time
  path: { type: String, required: true }, // e.g. '/san-pham/robot-cat-co' (no query)
  views: { type: Number, default: 0 },
}, { versionKey: false });

pageViewSchema.index({ day: 1, path: 1 }, { unique: true });

module.exports = mongoose.model('PageView', pageViewSchema);
