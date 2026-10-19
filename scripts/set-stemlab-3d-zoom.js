// One-off, safe to re-run: on the "Tư vấn, thiết kế và triển khai phòng Lab STEM" page, the "Thiết kế 3D" pictures open
// larger in a box when clicked (display style 'zoom', the same as new databases start with, lib/solution-pages.js).
// The section is found by its pictures (the tu-van-thiet-ke/3d-… files) and only changed while it has no display style.
// Usage: node scripts/set-stemlab-3d-zoom.js
require('dotenv').config();
const mongoose = require('mongoose');

const is3d = (s) => s.kind === 'gallery' && (s.media || []).some((m) => /\/tu-van-thiet-ke\/3d-[^/]+$/.test(m.src || ''));

async function setStemLab3dZoom(db) {
  const pages = db.collection('solutionpages');
  const page = await pages.findOne({ slug: 'stem-lab' });
  if (!page) return ['stem-lab: page not created yet (it will start with the zoomable 3D pictures)'];
  const log = [];
  const sections = (page.sections || []).map((s) => {
    if (!is3d(s) || s.display) return s;
    log.push(`stem-lab: "${s.titleVi}" pictures now open larger when clicked`);
    return { ...s, display: 'zoom' };
  });
  if (!log.length) return ['stem-lab: the 3D pictures already have a display style (nothing to do)'];
  await pages.updateOne({ _id: page._id }, { $set: { sections, updatedAt: new Date() } });
  return log;
}

module.exports = { setStemLab3dZoom };

if (require.main === module) {
  (async () => {
    const connectDB = require('../config/db');
    await connectDB();
    console.log((await setStemLab3dZoom(mongoose.connection.db)).join('\n'));
    await mongoose.disconnect();
  })().catch((err) => { console.error(err); process.exit(1); });
}
