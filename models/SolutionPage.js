const mongoose = require('mongoose');

// Editable "Giải pháp" pages (a, c, d, f). The page title is the menu label and the banner line lives in
// Admin → Cài đặt chung (lib/banners.js); everything below the banner is an ordered list of sections. All text is plain text (see lib/text.js).
const SLUGS = ['stem-lab', 'workshop', 'dao-tao', 'tap-huan'];
const SECTION_KINDS = ['text', 'cards', 'steps', 'gallery', 'stats', 'buttons'];
const RATIOS = ['16/9', '4/3', '3/2', '1/1', '3/4'];
// How a section is shown: '' as usual; 'collapsed' folded under its title; 'compact' (cards) first paragraph + "more";
// 'tabs' (gallery) one picture at a time behind tabs named after the caption (text before the first "—")
const DISPLAYS = { collapsed: ['text', 'cards', 'steps', 'gallery'], compact: ['cards'], tabs: ['gallery'] };

const itemSchema = new mongoose.Schema({
  titleVi: { type: String, default: '', trim: true },
  titleEn: { type: String, default: '', trim: true },
  textVi: { type: String, default: '' },
  textEn: { type: String, default: '' },
  url: { type: String, default: '', trim: true }, // buttons only
  primary: { type: Boolean, default: false }, // buttons: the highlighted (blue) button
}, { _id: false });

const mediaSchema = new mongoose.Schema({
  type: { type: String, enum: ['image', 'video'], default: 'image' },
  src: { type: String, required: true },
  poster: { type: String, default: '' },
  captionVi: { type: String, default: '', trim: true },
  captionEn: { type: String, default: '', trim: true },
  contain: { type: Boolean, default: false }, // show the whole image (plans, product shots) instead of filling the frame
}, { _id: false });

const sectionSchema = new mongoose.Schema({
  uid: { type: String, required: true },
  kind: { type: String, enum: SECTION_KINDS, default: 'text' },
  titleVi: { type: String, default: '', trim: true },
  titleEn: { type: String, default: '', trim: true },
  navVi: { type: String, default: '', trim: true }, // short name in the page's jump menu ('' = the title)
  navEn: { type: String, default: '', trim: true },
  subtitleVi: { type: String, default: '' },
  subtitleEn: { type: String, default: '' },
  textVi: { type: String, default: '' },
  textEn: { type: String, default: '' },
  columns: { type: Number, enum: [2, 3], default: 2 },
  ratio: { type: String, enum: RATIOS, default: '4/3' },
  display: { type: String, enum: ['', ...Object.keys(DISPLAYS)], default: '' },
  continued: { type: Boolean, default: false }, // shares the previous section's background block, with a smaller heading
  items: [itemSchema],
  media: [mediaSchema],
}, { _id: false });

const solutionPageSchema = new mongoose.Schema({
  slug: { type: String, enum: SLUGS, required: true, unique: true },
  sections: [sectionSchema],
}, { timestamps: true });

module.exports = mongoose.model('SolutionPage', solutionPageSchema);
module.exports.SLUGS = SLUGS;
module.exports.SECTION_KINDS = SECTION_KINDS;
module.exports.RATIOS = RATIOS;
module.exports.DISPLAYS = DISPLAYS;
