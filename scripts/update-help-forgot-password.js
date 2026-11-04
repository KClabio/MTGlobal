// One-off, safe to re-run: the saved Hỗ trợ answer about a forgotten password now names the "Quên mật khẩu" page.
// Changes that answer only if it is still the starter text; an answer the admin rewrote stays.
// Usage: node scripts/update-help-forgot-password.js
require('dotenv').config();
const mongoose = require('mongoose');
const HelpItem = require('../models/HelpItem');

const OLD_VI = "Nếu tài khoản dùng cùng email với một tài khoản Google, bạn có thể bấm \"Đăng nhập bằng Google\" để vào, rồi đặt mật khẩu mới trong Hồ sơ.\n\nNếu không, hãy gọi điện hoặc gửi email cho MTG (thông tin ở cuối trang này): chúng tôi sẽ giúp bạn lấy lại quyền truy cập.";
const OLD_EN = "If your account uses the same email as a Google account, you can click \"Log in with Google\" to get in, then set a new password in your Profile.\n\nOtherwise, call or email MTG (details at the bottom of this page) and we will help you get back into your account.";
const NEW_VI = "Bấm \"Quên mật khẩu?\" ở trang Đăng nhập rồi nhập email của bạn: chúng tôi sẽ gửi một liên kết để đặt mật khẩu mới, dùng được trong 60 phút.\n\nNếu tài khoản dùng cùng email với một tài khoản Google, bạn cũng có thể bấm \"Đăng nhập bằng Google\" để vào, rồi đặt mật khẩu mới trong Hồ sơ.\n\nNếu không nhận được email, hãy gọi điện hoặc gửi email cho MTG: chúng tôi sẽ giúp bạn lấy lại quyền truy cập.";
const NEW_EN = "Click \"Forgot your password?\" on the login page and enter your email: we will send a link to choose a new password, which works for 60 minutes.\n\nIf your account uses the same email as a Google account, you can also click \"Log in with Google\" to get in, then set a new password in your Profile.\n\nIf no email arrives, call or email MTG and we will help you get back into your account.";

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/mtglobal_db');
  const { modifiedCount } = await HelpItem.updateOne({ answerVi: OLD_VI, answerEn: OLD_EN }, { $set: { answerVi: NEW_VI, answerEn: NEW_EN } });
  console.log(`Help answers updated: ${modifiedCount}`);
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
