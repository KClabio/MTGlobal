// Adds/updates the Robot STEM (VEX Robotics) items in "Thiết bị, học liệu, Robot STEM".
// Safe to run more than once: items are matched by English name and updated in place (their order is kept).
// Usage: node scripts/add-robot-stem.js      (also called from scripts/seed.js)
require('dotenv').config();
const mongoose = require('mongoose');
const { GROUPS, OVERVIEW, ITEMS } = require('./data/robot-stem');

function contentOf(item) {
  const group = GROUPS[item.group];
  return {
    nameVi: item.nameVi, nameEn: item.nameEn, category: 'stem-equipment',
    subcategory: group.vi, subcategoryEn: group.en,
    descriptionVi: item.descriptionVi, descriptionEn: item.descriptionEn,
    images: item.images,
  };
}

async function upsertRobotStem(Product) {
  const all = await Product.find({ category: 'stem-equipment' }).sort({ order: 1, _id: 1 });
  const ours = new Set([OVERVIEW.nameEn, ...ITEMS.map((i) => i.nameEn)]);
  const existing = new Map(all.filter((p) => ours.has(p.nameEn)).map((p) => [p.nameEn, p]));
  const missing = [OVERVIEW, ...ITEMS].filter((i) => !existing.has(i.nameEn));

  // New items go straight after Phần I / Phần II; anything after that (other groups) moves down to make room
  const before = all.filter((p) => !ours.has(p.nameEn) && /^Phần (I|II)\b/.test(p.subcategory || ''));
  const insertAt = before.length ? Math.max(...before.map((p) => p.order || 0)) + 1 : 0;
  if (missing.length) {
    const shift = all.filter((p) => !ours.has(p.nameEn) && (p.order || 0) >= insertAt);
    for (const p of shift) await Product.updateOne({ _id: p._id }, { $inc: { order: missing.length + existing.size } });
  }

  let next = insertAt;
  const report = [];
  for (const item of [OVERVIEW, ...ITEMS]) {
    const doc = existing.get(item.nameEn);
    if (doc) {
      // Re-runs keep the admin's ordering; only a run that adds items lays the group out again
      await Product.updateOne({ _id: doc._id }, { $set: { ...contentOf(item), ...(missing.length ? { order: next } : {}) } });
      report.push(`updated  ${item.nameEn}`);
    } else {
      await Product.create({ ...contentOf(item), order: next });
      report.push(`added    ${item.nameEn}`);
    }
    next += 1;
  }
  return report;
}

module.exports = { upsertRobotStem };

if (require.main === module) {
  (async () => {
    const connectDB = require('../config/db');
    const Product = require('../models/Product');
    await connectDB();
    const report = await upsertRobotStem(Product);
    report.forEach((line) => console.log(line));
    await mongoose.disconnect();
  })().catch((err) => { console.error(err); process.exit(1); });
}
