const SiteSettings = require('../models/SiteSettings');

// The company settings are needed on every page, so they stay in memory. An admin save empties this copy's memory at
// once (clearSiteSettingsCache). With two copies of the site (PM2) the other copy can't know about that save, so on the
// live server the memory also ends by itself after SETTINGS_CACHE_SECONDS (blank = 60). On a test computer it lasts
// until the next save.
function settingsCacheSeconds(env = process.env) {
  const raw = env.SETTINGS_CACHE_SECONDS;
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return env.NODE_ENV === 'production' ? 60 : Infinity;
}

let cached = null;
let cachedUntil = 0;

async function getSiteSettings() {
  if (cached && Date.now() < cachedUntil) return cached;
  let settings;
  try {
    settings = await SiteSettings.findOne().lean();
    if (!settings) {
      settings = await SiteSettings.create({});
      settings = settings.toObject();
    }
  } catch (err) {
    if (cached) return cached; // a moment without the database: the settings just read are still good
    throw err;
  }
  cached = settings;
  cachedUntil = Date.now() + settingsCacheSeconds() * 1000;
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

module.exports = { loadSiteSettings, getSiteSettings, clearSiteSettingsCache, settingsCacheSeconds };
