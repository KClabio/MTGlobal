require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Service = require('../models/Service');
const { DU_HOC_CONTENT } = require('../lib/service-content');

// One-off: fills the Tư vấn du học page with the STEM study-abroad program (text, posters, card picture, the
// "Hồ sơ du học STEM gồm những gì?" cards and the 5 steps). Safe to run again:
//   - the summary and description are replaced only while they are still the old "đang được cập nhật" text,
//     and each other part only while it is empty, so nothing an admin has written is lost;
//   - --force replaces everything listed in DU_HOC_CONTENT; the request-form questions are never touched.
//   node scripts/fill-du-hoc.js [--force]
const SLUG = 'tu-van-du-hoc';
const OLD_TEXT = /đang được cập nhật|being updated/i;

const isEmpty = (value) => value == null || value === '' || (Array.isArray(value) && value.length === 0);

async function main() {
  const force = process.argv.includes('--force');
  await connectDB();
  const service = await Service.findOne({ slug: SLUG });
  if (!service) throw new Error(`Không tìm thấy dịch vụ "${SLUG}".`);

  const changed = [];
  for (const [key, value] of Object.entries(DU_HOC_CONTENT)) {
    const current = service[key];
    const placeholder = /^(summary|body)(Vi|En)$/.test(key) && (isEmpty(current) || OLD_TEXT.test(current) || /^summary/.test(key) && OLD_TEXT.test(service.bodyVi || ''));
    if (force || isEmpty(current) || placeholder) {
      service[key] = value;
      changed.push(key);
    }
  }

  if (changed.length) {
    await service.save();
    console.log(`${SLUG}: đã cập nhật ${changed.join(', ')}`);
  } else {
    console.log(`${SLUG}: đã có nội dung, bỏ qua (dùng --force để ghi đè)`);
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
