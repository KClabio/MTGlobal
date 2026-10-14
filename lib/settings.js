const SiteSettings = require('../models/SiteSettings');

let cached = null;

async function getSiteSettings() {
  if (cached) return cached;
  let settings = await SiteSettings.findOne().lean();
  if (!settings) {
    settings = await SiteSettings.create({});
    settings = settings.toObject();
  }
  cached = settings;
  return settings;
}

function clearSiteSettingsCache() {
  cached = null;
}

async function loadSiteSettings(req, res, next) {
  try {
    res.locals.settings = await getSiteSettings();
  } catch (err) {
    res.locals.settings = {};
  }
  next();
}

module.exports = { loadSiteSettings, getSiteSettings, clearSiteSettingsCache };
