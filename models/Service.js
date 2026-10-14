const mongoose = require('mongoose');

// Repeatable page sections; each one is hidden on the public page until it has content
const stepSchema = new mongoose.Schema({
  titleVi: { type: String, default: '', trim: true },
  titleEn: { type: String, default: '', trim: true },
  textVi: { type: String, default: '' },
  textEn: { type: String, default: '' },
}, { _id: false });

const packageSchema = new mongoose.Schema({
  nameVi: { type: String, default: '', trim: true },
  nameEn: { type: String, default: '', trim: true },
  priceVi: { type: String, default: '', trim: true }, // free text, e.g. "Liên hệ" or "Từ 5.000.000đ"
  priceEn: { type: String, default: '', trim: true },
  featuresVi: [{ type: String }], // one feature per line in the editor
  featuresEn: [{ type: String }],
  highlighted: { type: Boolean, default: false },
}, { _id: false });

const faqSchema = new mongoose.Schema({
  questionVi: { type: String, default: '', trim: true },
  questionEn: { type: String, default: '', trim: true },
  answerVi: { type: String, default: '' },
  answerEn: { type: String, default: '' },
}, { _id: false });

const testimonialSchema = new mongoose.Schema({
  quoteVi: { type: String, default: '' },
  quoteEn: { type: String, default: '' },
  author: { type: String, default: '', trim: true },
  role: { type: String, default: '', trim: true },
}, { _id: false });

// Extra questions on this service's request form. "key" stays the same when questions are reordered or renamed.
const QUESTION_TYPES = ['text', 'number', 'choice'];
const questionSchema = new mongoose.Schema({
  key: { type: String, required: true },
  labelVi: { type: String, default: '', trim: true },
  labelEn: { type: String, default: '', trim: true },
  type: { type: String, enum: QUESTION_TYPES, default: 'text' },
  options: [{ _id: false, vi: { type: String, default: '' }, en: { type: String, default: '' } }],
  required: { type: Boolean, default: false },
}, { _id: false });

const serviceSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true, trim: true },
  titleVi: { type: String, required: true, trim: true },
  titleEn: { type: String, default: '', trim: true },
  summaryVi: { type: String, default: '' },
  summaryEn: { type: String, default: '' },
  bodyVi: { type: String, default: '' },
  bodyEn: { type: String, default: '' },
  heroImage: { type: String, default: null },
  steps: [stepSchema],
  packages: [packageSchema],
  faqs: [faqSchema],
  gallery: [{ type: String }],
  testimonials: [testimonialSchema],
  questions: [questionSchema],
  order: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('Service', serviceSchema);
module.exports.QUESTION_TYPES = QUESTION_TYPES;
