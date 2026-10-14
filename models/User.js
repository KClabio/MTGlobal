const mongoose = require('mongoose');
const { ROLES } = require('../lib/roles');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ROLES, default: 'customer' },
  phone: { type: String, default: '' },
  schoolOrCompany: { type: String, default: '' },
  avatar: { type: String, default: null },
  bio: { type: String, default: '', trim: true, maxlength: 500 },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
