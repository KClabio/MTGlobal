const mongoose = require('mongoose');

const PRODUCT_CATEGORIES = [
  'robot-leo-cau-thang',
  'robot-di-theo-nguoi',
  'robot-cat-co',
  'robot-gia-dinh',
  'stem-equipment',
];

const specSchema = new mongoose.Schema({
  key: { type: String, trim: true },
  value: { type: String, trim: true },
}, { _id: false });

const productSchema = new mongoose.Schema({
  nameVi: { type: String, required: true, trim: true },
  nameEn: { type: String, default: '', trim: true },
  category: { type: String, enum: PRODUCT_CATEGORIES, required: true },
  subcategory: { type: String, default: '', trim: true }, // equipment group, Vietnamese
  subcategoryEn: { type: String, default: '', trim: true },
  descriptionVi: { type: String, default: '' },
  descriptionEn: { type: String, default: '' },
  images: [{ type: String }],
  videos: [{ type: String }],
  specs: [specSchema],
  comingSoon: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
module.exports.PRODUCT_CATEGORIES = PRODUCT_CATEGORIES;
