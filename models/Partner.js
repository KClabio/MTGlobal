const mongoose = require('mongoose');

const partnerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  logo: { type: String, default: null },
  url: { type: String, default: null },
  order: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Partner', partnerSchema);
