// One-off, safe to re-run: brings the saved Giải pháp pages in line with the new defaults (lib/solution-pages.js)
// without touching anything else the admin wrote.
// - "Tập huấn & triển khai": the "Kết nối cùng hệ sinh thái VEX Robotics toàn cầu" numbers get a "Khám phá VEX Robotics"
//   button that opens the VEX Robotics website.
// - "Workshop trải nghiệm STEM" / "Đào tạo STEM": their "Đăng ký" buttons pick their own choice in the contact form's
//   "Bạn quan tâm đến" list (it used to be "Giải pháp phòng Lab STEM" for both).
// Usage: node scripts/update-page-links.js
require('dotenv').config();
const mongoose = require('mongoose');
const { VEX_URL } = require('../lib/solution-pages');

const OLD_TOPIC = '/lien-he?quan_tam=giai-phap-stem-lab';
const NEW_TOPIC = { workshop: '/lien-he?quan_tam=workshop-stem', 'dao-tao': '/lien-he?quan_tam=dao-tao-stem' };

async function updatePageLinks(db) {
  const pages = db.collection('solutionpages');
  const report = [];

  const tapHuan = await pages.findOne({ slug: 'tap-huan' });
  if (!tapHuan) {
    report.push('tap-huan: page not created yet (it will start with the VEX button)');
  } else {
    const sections = tapHuan.sections || [];
    const vex = sections.findIndex((s) => s.kind === 'stats' && /VEX/i.test(`${s.titleVi} ${s.titleEn}`));
    if (vex < 0) report.push('tap-huan: no VEX numbers section found (nothing to do)');
    else if ((sections[vex].items || []).some((it) => it.url)) report.push('tap-huan: the VEX numbers already have a button (nothing to do)');
    else {
      const items = (sections[vex].items || []).concat({ titleVi: 'Khám phá VEX Robotics', titleEn: 'Explore VEX Robotics', textVi: '', textEn: '', url: VEX_URL, primary: true });
      await pages.updateOne({ _id: tapHuan._id }, { $set: { [`sections.${vex}.items`]: items, updatedAt: new Date() } });
      report.push('tap-huan: added the "Khám phá VEX Robotics" button under the VEX numbers');
    }
  }

  for (const [slug, url] of Object.entries(NEW_TOPIC)) {
    const page = await pages.findOne({ slug });
    if (!page) { report.push(`${slug}: page not created yet (it will start with the new link)`); continue; }
    let changed = 0;
    const sections = (page.sections || []).map((s) => ({
      ...s,
      items: (s.items || []).map((it) => {
        if (it.url !== OLD_TOPIC || !/^Đăng ký/.test(it.titleVi || '')) return it;
        changed += 1;
        return { ...it, url };
      }),
    }));
    if (!changed) { report.push(`${slug}: "Đăng ký" button already up to date (nothing to do)`); continue; }
    await pages.updateOne({ _id: page._id }, { $set: { sections, updatedAt: new Date() } });
    report.push(`${slug}: "Đăng ký" button now opens the contact form on ${url.split('=')[1]}`);
  }
  return report;
}

module.exports = { updatePageLinks };

if (require.main === module) {
  (async () => {
    const connectDB = require('../config/db');
    await connectDB();
    console.log((await updatePageLinks(mongoose.connection.db)).join('\n'));
    await mongoose.disconnect();
  })().catch((err) => { console.error(err); process.exit(1); });
}
