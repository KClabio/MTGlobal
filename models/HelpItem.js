const mongoose = require('mongoose');

// One question on the Hỗ trợ page (/ho-tro), in one of the fixed groups of lib/help-topics.js
const helpItemSchema = new mongoose.Schema({
  group: { type: String, required: true, enum: ['tai-khoan', 'gui-yeu-cau', 'san-pham', 'quyen-rieng-tu', 'su-dung'] },
  questionVi: { type: String, required: true, trim: true },
  questionEn: { type: String, default: '', trim: true },
  answerVi: { type: String, required: true }, // plain text (lib/text.js)
  answerEn: { type: String, default: '' },
  published: { type: Boolean, default: true },
  order: { type: Number, default: 0 }, // within its group
}, { timestamps: true });

module.exports = mongoose.model('HelpItem', helpItemSchema);
