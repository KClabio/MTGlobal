const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
  titleVi: { type: String, required: true, trim: true },
  titleEn: { type: String, default: '', trim: true },
  bodyVi: { type: String, default: '' },
  bodyEn: { type: String, default: '' },
  coverImage: { type: String, default: null },
  published: { type: Boolean, default: true },
  order: { type: Number, default: 0 }, // set by drag-and-drop in the admin; new articles go first
  // Who put the article up (shown in the admin list only). The name and role are a copy for when the account is gone;
  // older articles get one at their next save.
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  uploaderName: { type: String, default: '' },
  uploaderRole: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Article', articleSchema);
