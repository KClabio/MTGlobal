// One-off, safe to re-run: the Giải pháp pages used to keep their banner line on the page itself (subtitleVi/En).
// Banners now live in Admin → Cài đặt chung (settings.banners). A line that was changed from the default is
// copied there (unless a banner override already exists), then the old page fields are removed.
// Usage: node scripts/migrate-banners.js   (also called from scripts/seed.js)
require('dotenv').config();
const mongoose = require('mongoose');
const { BANNERS } = require('../lib/banners');

async function migrateBanners(db) {
  const pages = db.collection('solutionpages');
  const settingsCol = db.collection('sitesettings');
  const settings = (await settingsCol.findOne({})) || { banners: {} };
  const banners = settings.banners || {};
  const report = [];
  for (const page of await pages.find({ $or: [{ subtitleVi: { $exists: true } }, { subtitleEn: { $exists: true } }] }).toArray()) {
    const def = BANNERS.find((b) => b.key === page.slug);
    const existing = banners[page.slug] || {};
    const set = {};
    if (def && page.subtitleVi && page.subtitleVi.trim() !== def.defaultVi && !existing.subtitleVi) set[`banners.${page.slug}.subtitleVi`] = page.subtitleVi.trim();
    if (def && page.subtitleEn && page.subtitleEn.trim() !== def.defaultEn && !existing.subtitleEn) set[`banners.${page.slug}.subtitleEn`] = page.subtitleEn.trim();
    if (Object.keys(set).length) {
      await settingsCol.updateOne({ _id: settings._id }, { $set: set }, { upsert: true });
      report.push(`${page.slug}: custom banner line moved to Cài đặt chung`);
    } else {
      report.push(`${page.slug}: banner line was the default`);
    }
    await pages.updateOne({ _id: page._id }, { $unset: { subtitleVi: '', subtitleEn: '' } });
  }
  return report;
}

module.exports = { migrateBanners };

if (require.main === module) {
  (async () => {
    const connectDB = require('../config/db');
    await connectDB();
    const report = await migrateBanners(mongoose.connection.db);
    console.log(report.length ? report.join('\n') : 'nothing to migrate');
    await mongoose.disconnect();
  })().catch((err) => { console.error(err); process.exit(1); });
}
