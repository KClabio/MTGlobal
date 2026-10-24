const mongoose = require('mongoose');

// A page banner's admin override (empty text = the default line from lib/banners.js) and optional background image
const bannerSchema = new mongoose.Schema({
  subtitleVi: { type: String, default: '' },
  subtitleEn: { type: String, default: '' },
  image: { type: String, default: null },
}, { _id: false });

const siteSettingsSchema = new mongoose.Schema({
  logo: { type: String, default: null },
  // Home page hero text overrides (empty = the default text in locales home.heroTitle / home.heroSubtitle)
  homeHero: {
    titleVi: { type: String, default: '' },
    titleEn: { type: String, default: '' },
    subtitleVi: { type: String, default: '' },
    subtitleEn: { type: String, default: '' },
  },
  banners: { type: Map, of: bannerSchema, default: {} }, // keyed by lib/banners.js keys
  heroImages: {
    home: { type: String, default: null },
    products: { type: String, default: null },
    solution: { type: String, default: null },
    services: { type: String, default: null },
  },
  companyProfile: { type: String, default: '' }, // Vietnamese
  companyProfileEn: { type: String, default: '' },
  // Chính sách bảo mật (/chinh-sach-bao-mat): empty = the default draft of lib/privacy-policy.js
  privacyPolicy: { type: String, default: '' }, // Vietnamese
  privacyPolicyEn: { type: String, default: '' },
  // The Hỗ trợ page's starter questions were saved once (lib/help-topics.js): never again, even if all are deleted
  helpSeeded: { type: Boolean, default: false },
  contactInfo: {
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    mapEmbedUrl: { type: String, default: '' },
  },
}, { timestamps: true });

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
