const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  titleVi: { type: String, required: true, trim: true },
  titleEn: { type: String, default: '', trim: true },
  schoolName: { type: String, default: '', trim: true },
  location: { type: String, default: '', trim: true },
  // School level for the sections on /giai-phap/du-an; '' = worked out from the school name (lib/project-levels.js)
  level: { type: String, enum: ['', 'thcs', 'thpt', 'dai-hoc', 'khac'], default: '' },
  descriptionVi: { type: String, default: '' },
  descriptionEn: { type: String, default: '' },
  images: [{ type: String }],
  videoUrl: { type: String, default: null },
  order: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);
