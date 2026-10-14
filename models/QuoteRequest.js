const mongoose = require('mongoose');

const INTERESTED_IN = [
  'san-pham-robot',
  'giai-phap-stem-lab',
  'tu-van-du-hoc',
  'phan-phoi-san-pham',
  'khac',
];

const quoteRequestSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true },
  schoolOrCompany: { type: String, default: '', trim: true },
  message: { type: String, required: true, trim: true },
  interestedIn: { type: String, enum: INTERESTED_IN, default: 'khac' },
  status: { type: String, enum: ['moi', 'da_lien_he', 'hoan_tat'], default: 'moi' }, // see STATUSES below
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  // Answers to a service's own questions, copied at submit time so they still read correctly after the questions change
  details: [{
    _id: false,
    labelVi: { type: String, default: '' },
    labelEn: { type: String, default: '' },
    valueVi: { type: String, default: '' },
    valueEn: { type: String, default: '' },
  }],
}, { timestamps: true });

// Labels for these codes live in locales/*.json under admin.interest.* and admin.status.*
const STATUSES = ['moi', 'da_lien_he', 'hoan_tat'];

module.exports = mongoose.model('QuoteRequest', quoteRequestSchema);
module.exports.INTERESTED_IN = INTERESTED_IN;
module.exports.STATUSES = STATUSES;
