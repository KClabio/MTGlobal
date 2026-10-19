// One-off, safe to re-run: on the "Tư vấn, thiết kế và triển khai phòng Lab STEM" page, the "Mẫu thiết kế phân khu theo
// cấp học" pictures now show their description beside the picture. Mầm non and THCS only had one short line, so they get
// the fuller description written from their room drawings (the same text new databases start with, lib/solution-pages.js).
// A caption is only replaced while it still has the old short text, so an admin's own wording is never overwritten.
// Usage: node scripts/update-stemlab-layout-captions.js
require('dotenv').config();
const mongoose = require('mongoose');
const { defaultContent } = require('../lib/solution-pages');

const OLD = [
  { vi: 'Mầm non — Mẫu phòng STEM Mầm non, 40 m²', en: 'Preschool — Preschool STEM room, 40 m²' },
  { vi: 'THCS — Mẫu phòng THCS, 80–120 m²', en: 'Lower secondary — Lower secondary STEM Lab, 80–120 m²' },
];

async function updateStemLabLayoutCaptions(db) {
  const pages = db.collection('solutionpages');
  const page = await pages.findOne({ slug: 'stem-lab' });
  if (!page) return ['stem-lab: page not created yet (it will start with the new descriptions)'];
  const fresh = ((await defaultContent('stem-lab')).sections || []).flatMap((s) => s.media || []);
  const log = [];
  const sections = (page.sections || []).map((s) => {
    if (s.kind !== 'gallery') return s;
    const media = (s.media || []).map((m) => {
      const old = OLD.find((o) => o.vi === m.captionVi);
      const next = old && fresh.find((f) => f.src === m.src);
      if (!next) return m;
      log.push(`stem-lab: new description for "${old.vi.split(' — ')[0]}"`);
      return { ...m, captionVi: next.captionVi, captionEn: m.captionEn === old.en || !m.captionEn ? next.captionEn : m.captionEn };
    });
    return { ...s, media };
  });
  if (!log.length) return ['stem-lab: no short sample-layout captions left (nothing to do)'];
  await pages.updateOne({ _id: page._id }, { $set: { sections, updatedAt: new Date() } });
  return log;
}

module.exports = { updateStemLabLayoutCaptions };

if (require.main === module) {
  (async () => {
    const connectDB = require('../config/db');
    await connectDB();
    console.log((await updateStemLabLayoutCaptions(mongoose.connection.db)).join('\n'));
    await mongoose.disconnect();
  })().catch((err) => { console.error(err); process.exit(1); });
}
