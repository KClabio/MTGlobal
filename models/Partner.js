const mongoose = require('mongoose');

const partnerSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, trim: true, unique: true, sparse: true }, // the partner's page: /doi-tac/<slug>
  logo: { type: String, default: null },
  url: { type: String, default: null }, // the partner's own website (button on its page)
  descriptionVi: { type: String, default: '' },
  descriptionEn: { type: String, default: '' },
  contacts: { type: String, default: '' }, // one per line, optionally "Label: value"
  order: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Partner', partnerSchema);
