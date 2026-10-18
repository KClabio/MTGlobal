// One-off, safe to re-run: the "Tư vấn, thiết kế và triển khai phòng Lab STEM" page used to have a row of two buttons
// ("Yêu cầu tư vấn" / "Thiết bị, học liệu, Robot STEM") right under its key numbers. The closing "Khám phá thêm" section
// and the consultation band at the bottom of the page already do that job, so the row is removed. The page's last
// block of buttons (shown as "Khám phá thêm") is never touched. New databases don't get the row (lib/solution-pages.js).
// Usage: node scripts/remove-stemlab-top-buttons.js
require('dotenv').config();
const mongoose = require('mongoose');

async function removeStemLabTopButtons(db) {
  const pages = db.collection('solutionpages');
  const page = await pages.findOne({ slug: 'stem-lab' });
  if (!page) return ['stem-lab: page not created yet (it will start without the row)'];
  const sections = page.sections || [];
  const stats = sections.findIndex((s) => s.kind === 'stats');
  const next = stats + 1;
  const isRow = stats >= 0 && next < sections.length - 1 && sections[next].kind === 'buttons';
  if (!isRow) return ['stem-lab: no button row under the key numbers (nothing to do)'];
  const labels = (sections[next].items || []).map((it) => it.titleVi).join(' / ');
  await pages.updateOne({ _id: page._id }, { $set: { sections: sections.filter((s, i) => i !== next), updatedAt: new Date() } });
  return [`stem-lab: removed the button row under the key numbers (${labels})`];
}

module.exports = { removeStemLabTopButtons };

if (require.main === module) {
  (async () => {
    const connectDB = require('../config/db');
    await connectDB();
    console.log((await removeStemLabTopButtons(mongoose.connection.db)).join('\n'));
    await mongoose.disconnect();
  })().catch((err) => { console.error(err); process.exit(1); });
}
