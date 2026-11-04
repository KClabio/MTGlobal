// One-off, safe to re-run: the saved Hỗ trợ answers still gave the old password rule (6 characters; it is 8 now).
// Changes only that phrase; anything else the admin wrote stays.
// Usage: node scripts/fix-help-password-text.js
require('dotenv').config();
const mongoose = require('mongoose');
const HelpItem = require('../models/HelpItem');

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mtglobal_db');
  const items = await HelpItem.find({ $or: [{ answerVi: /tối thiểu 6 ký tự/ }, { answerEn: /at least 6 characters/ }] });
  for (const item of items) {
    item.answerVi = item.answerVi.replace('tối thiểu 6 ký tự', 'tối thiểu 8 ký tự');
    item.answerEn = item.answerEn.replace('at least 6 characters', 'at least 8 characters');
    await item.save();
  }
  console.log(`Help answers corrected: ${items.length}`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
