const mongoose = require('mongoose');
const { ROLES } = require('../lib/roles');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, default: null }, // null: an account made with "Đăng nhập bằng Google" that has set no password
  googleId: { type: String, default: undefined, index: { unique: true, sparse: true } }, // linked Google account (routes/auth.js)
  role: { type: String, enum: ROLES, default: 'customer' },
  phone: { type: String, default: '' },
  schoolOrCompany: { type: String, default: '' },
  avatar: { type: String, default: null },
  // '': a Google account's photo follows Google; 'own': the person uploaded one; 'none': they deleted it (Google doesn't bring it back)
  avatarMode: { type: String, enum: ['', 'own', 'none'], default: '' },
  bio: { type: String, default: '', trim: true, maxlength: 500 },
  // When the person agreed to the Chính sách bảo mật: the sign-up tick, or continuing with Google for a new account
  privacyAcceptedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
