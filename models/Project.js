const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  titleVi: { type: String, required: true, trim: true },
  titleEn: { type: String, default: '', trim: true },
  schoolName: { type: String, default: '', trim: true },
  location: { type: String, default: '', trim: true },
  descriptionVi: { type: String, default: '' },
  descriptionEn: { type: String, default: '' },
  images: [{ type: String }],
  videoUrl: { type: String, default: null },
  order: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);
