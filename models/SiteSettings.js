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
  // Điều khoản sử dụng (/dieu-khoan-su-dung): empty = the default draft of lib/terms-of-use.js
  termsOfUse: { type: String, default: '' }, // Vietnamese
  termsOfUseEn: { type: String, default: '' },
  // The Hỗ trợ page's starter questions were saved once (lib/help-topics.js): never again, even if all are deleted
  helpSeeded: { type: Boolean, default: false },
  contactInfo: {
    address: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    mapEmbedUrl: { type: String, default: '' }, // a Google Maps embed address only (lib/map-embed.js): the map on Liên hệ
    // Mã số doanh nghiệp (the tax code) and where/when it was issued: footer, Về MTG, Google's company card, legal texts
    taxCode: { type: String, default: '' },
    registration: { type: String, default: '' },
    zalo: { type: String, default: '' }, // phone number of the company's Zalo: the chat button (partials/chat-button.ejs)
    messenger: { type: String, default: '' }, // Facebook page name (m.me/<name>): the chat button
  },
  // Who gets an email for each new or changed request (Cài đặt chung; lib/request-mail.js), at most 10 addresses
  requestEmails: { type: [String], default: [] },
  // There is one settings record, and each save writes only what it changes. Without a version number two saves at the
  // same moment simply both go through, the later one winning, instead of one failing with an error.
}, { timestamps: true, versionKey: false });

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
