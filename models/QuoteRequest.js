const mongoose = require('mongoose');

// In the order of the contact form's "Bạn quan tâm đến" list (and the dashboard), grouped as in INTEREST_GROUPS
const INTEREST_GROUPS = [
  { key: 'solutions', codes: ['giai-phap-stem-lab', 'thiet-bi-stem', 'workshop-stem', 'dao-tao-stem', 'tap-huan-stem'] },
  { key: 'products', codes: ['san-pham-robot'] },
  { key: 'services', codes: ['tu-van-du-hoc', 'phan-phoi-san-pham'] },
];
const INTERESTED_IN = [...INTEREST_GROUPS.flatMap((g) => g.codes), 'khac'];

const quoteRequestSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true },
  schoolOrCompany: { type: String, default: '', trim: true },
  message: { type: String, required: true, trim: true },
  interestedIn: { type: String, enum: INTERESTED_IN, default: 'khac' },
  status: { type: String, enum: ['moi', 'da_lien_he', 'hoan_tat'], default: 'moi' }, // see STATUSES below
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  editedAt: { type: Date, default: null }, // last change by the sender ("Yêu cầu của tôi" → Sửa); staff see "Đã sửa lúc …"
  privacyAcceptedAt: { type: Date, default: null }, // when the sender ticked "Tôi đồng ý với Chính sách bảo mật" (sent or changed)
  // Answers to a service's own questions, copied at submit time so they still read correctly after the questions change
  details: [{
    _id: false,
    kind: { type: String, default: '' }, // 'product': which robot a robot-page request is about (shown with the category)
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
module.exports.INTEREST_GROUPS = INTEREST_GROUPS;
// The "Sản phẩm: …" line of a robot request (requests saved before `kind` existed are recognised by their label)
module.exports.isProductLine = (d) => d.kind === 'product' || (!d.kind && d.labelVi === 'Sản phẩm');
module.exports.STATUSES = STATUSES;
