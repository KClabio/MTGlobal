require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');

// Turns off an account's two-step login (lib/two-factor.js), e.g. an owner who lost their phone and backup codes.
// The account is logged out everywhere and sets two-step up again (new QR code) at its next login.
// Admins can also be reset by an owner in Admin → Người dùng → "Đặt lại 2 bước".
//   node scripts/reset-2fa.js email@cua-ban.com
async function main() {
  const email = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!email) {
    console.error('Cách dùng: node scripts/reset-2fa.js email@cua-ban.com');
    process.exit(1);
  }
  await connectDB();
  const user = await User.findOneAndUpdate({ email: email.toLowerCase().trim() }, { $unset: { twoFactor: 1 } });
  if (!user) {
    console.error(`Không tìm thấy người dùng với email: ${email}`);
  } else {
    await mongoose.connection.collection('sessions').deleteMany({ session: { $regex: `"userId":"${user._id}"` } });
    console.log(`Đã đặt lại đăng nhập 2 bước cho: ${user.name} <${user.email}>. Lần đăng nhập sau sẽ quét mã QR mới.`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
