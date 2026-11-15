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

// "Thẻ nội dung": a block of coloured cards, each a title with a ticked list (e.g. the parts of a study-abroad profile)
const CARD_ICONS = ['graduation-cap', 'cpu', 'trophy', 'users', 'file-text', 'globe', 'wrench', 'bot', 'check-circle'];
const cardSchema = new mongoose.Schema({
  titleVi: { type: String, default: '', trim: true },
  titleEn: { type: String, default: '', trim: true },
  itemsVi: [{ type: String }], // one item per line in the editor
  itemsEn: [{ type: String }],
  icon: { type: String, enum: CARD_ICONS, default: 'check-circle' },
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
  heroImageEn: { type: String, default: null }, // the English page's main picture (a poster with English text); else heroImage
  cardImage: { type: String, default: null }, // the picture on the Dịch vụ and Trang chủ cards; else heroImage
  cardsTitleVi: { type: String, default: '', trim: true },
  cardsTitleEn: { type: String, default: '', trim: true },
  cards: [cardSchema],
  stepsTitleVi: { type: String, default: '', trim: true }, // replaces "Quy trình làm việc" when filled in
  stepsTitleEn: { type: String, default: '', trim: true },
  steps: [stepSchema],
  packages: [packageSchema],
  faqs: [faqSchema],
  gallery: [{ type: String }],
  testimonials: [testimonialSchema],
  questions: [questionSchema],
  order: { type: Number, default: 0 },
  // Each save replaces its lists whole, so a version number has nothing to protect: two saves at the same moment both
  // go through, the later one winning, instead of one failing with an error.
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('Service', serviceSchema);
module.exports.QUESTION_TYPES = QUESTION_TYPES;
module.exports.CARD_ICONS = CARD_ICONS;
