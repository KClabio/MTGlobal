require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const { ROLE_LABELS } = require('../lib/roles');

// Server-side role management (also the recovery path if the website's owner account is lost):
//   node scripts/make-admin.js email@cua-ban.com            -> admin
//   node scripts/make-admin.js email@cua-ban.com --owner    -> owner (chủ sở hữu)
//   node scripts/make-admin.js email@cua-ban.com --customer -> back to a normal customer
async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'));
  if (!email) {
    console.error('Cách dùng: node scripts/make-admin.js email@cua-ban.com [--owner | --customer]');
    process.exit(1);
  }
  const role = args.includes('--owner') ? 'owner' : args.includes('--customer') ? 'customer' : 'admin';

  await connectDB();
  const user = await User.findOneAndUpdate(
    { email: email.toLowerCase().trim() },
    { role },
    { returnDocument: 'after' }
  );

  if (!user) {
    console.error(`Không tìm thấy người dùng với email: ${email}`);
  } else {
    console.log(`Đã đặt vai trò "${ROLE_LABELS[role]}" cho: ${user.name} <${user.email}>`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
