require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Service = require('../models/Service');
const { STARTER_QUESTIONS } = require('../lib/service-content');

// One-off: gives each service its starter request-form questions, only if it has none yet (safe to run again).
//   node scripts/service-questions.js
async function main() {
  await connectDB();
  for (const [slug, questions] of Object.entries(STARTER_QUESTIONS)) {
    const result = await Service.updateOne(
      { slug, $or: [{ questions: { $exists: false } }, { questions: { $size: 0 } }] },
      { $set: { questions } }
    );
    console.log(`${slug}: ${result.modifiedCount ? `đã thêm ${questions.length} câu hỏi` : 'đã có câu hỏi, bỏ qua'}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
