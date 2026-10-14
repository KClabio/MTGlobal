const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { uploadAvatar, AVATAR_MAX_BYTES, isRealImageFile, fileUrl, wrapUpload, removeLocalUpload } = require('../middleware/upload');
const { isStaff } = require('../lib/roles');
const { isValidEmail, isNonEmpty } = require('../lib/validators');

router.get('/dang-ky', (req, res) => {
  res.render('register', { error: null, values: {} });
});

router.post('/dang-ky', async (req, res) => {
  const { name, email, password, confirmPassword, phone, schoolOrCompany } = req.body;
  const values = { name, email, phone, schoolOrCompany };

  if (!isNonEmpty(name) || !isValidEmail(email) || !isNonEmpty(password)) {
    return res.status(400).render('register', { error: 'Vui lòng nhập đầy đủ họ tên, email hợp lệ và mật khẩu.', values });
  }
  if (password.length < 6) {
    return res.status(400).render('register', { error: 'Mật khẩu cần tối thiểu 6 ký tự.', values });
  }
  if (password !== confirmPassword) {
    return res.status(400).render('register', { error: 'Mật khẩu xác nhận không khớp.', values });
  }

  const existing = await User.findOne({ email: email.toLowerCase().trim() }).lean();
  if (existing) {
    return res.status(400).render('register', { error: 'Email này đã được đăng ký.', values });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    passwordHash,
    phone: (phone || '').trim(),
    schoolOrCompany: (schoolOrCompany || '').trim(),
  });

  req.session.userId = user._id;
  res.redirect('/tai-khoan');
});

router.get('/dang-nhap', (req, res) => {
  res.render('login', { error: null, redirectTo: req.query.redirect || '/' });
});

router.post('/dang-nhap', async (req, res) => {
  const { email, password, redirectTo } = req.body;
  const user = await User.findOne({ email: (email || '').toLowerCase().trim() });
  const ok = user && (await bcrypt.compare(password || '', user.passwordHash));
  if (!ok) {
    return res.status(400).render('login', { error: 'Email hoặc mật khẩu không đúng.', redirectTo: redirectTo || '/' });
  }
  req.session.userId = user._id;
  res.redirect(isStaff(user.role) ? '/admin' : (redirectTo || '/tai-khoan'));
});

router.post('/dang-xuat', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

const BIO_MAX = 500;
const PASSWORD_MIN = 6;

function renderProfile(res, { status = 200, profileState = {}, passwordState = {}, values = null } = {}) {
  res.status(status).render('profile', { profileState, passwordState, values, avatarMaxBytes: AVATAR_MAX_BYTES });
}

router.get('/ho-so', requireAuth, (req, res) => {
  renderProfile(res);
});

router.post('/ho-so', requireAuth, wrapUpload(uploadAvatar, async (req, res) => {
  const t = res.locals.t;
  const field = (key) => (typeof req.body[key] === 'string' ? req.body[key].trim() : '');
  // Forms submit line breaks as \r\n; store \n so the length matches the textarea's own 500-character count
  const values = { name: field('name'), phone: field('phone'), schoolOrCompany: field('schoolOrCompany'), bio: field('bio').replace(/\r\n?/g, '\n') };
  const newAvatar = req.file ? fileUrl(req.file) : null;

  let error = null;
  if (req.uploadError) {
    error = req.uploadErrorCode === 'LIMIT_FILE_SIZE' ? t('profile.errAvatarSize') : t('profile.errAvatarType');
  } else if (req.file && !(await isRealImageFile(req.file))) {
    error = t('profile.errAvatarType');
  } else if (!isNonEmpty(values.name)) {
    error = t('forms.errName');
  } else if (values.bio.length > BIO_MAX) {
    error = t('profile.errBioLength');
  }
  if (error) {
    removeLocalUpload(newAvatar); // don't keep a photo from a rejected submit
    return renderProfile(res, { status: 400, profileState: { error }, values });
  }

  const update = { ...values };
  const previousAvatar = req.user.avatar;
  if (newAvatar) update.avatar = newAvatar;
  else if (req.body.removeAvatar === '1') update.avatar = null;

  const updated = await User.findByIdAndUpdate(req.user._id, update, { returnDocument: 'after', runValidators: true }).lean();
  if ('avatar' in update && previousAvatar && previousAvatar !== update.avatar) removeLocalUpload(previousAvatar);

  res.locals.user = updated;
  renderProfile(res, { profileState: { success: true } });
}));

router.post('/ho-so/mat-khau', requireAuth, async (req, res) => {
  const t = res.locals.t;
  const { currentPassword = '', newPassword = '', confirmPassword = '' } = req.body;
  const user = await User.findById(req.user._id);

  let error = null;
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) error = t('profile.errCurrentPassword');
  else if (newPassword.length < PASSWORD_MIN) error = t('profile.errPasswordLength');
  else if (newPassword === currentPassword) error = t('profile.errPasswordSame');
  else if (newPassword !== confirmPassword) error = t('profile.errPasswordMatch');
  if (error) return renderProfile(res, { status: 400, passwordState: { error } });

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();

  // New session id after a credential change; keep the user logged in
  req.session.regenerate((err) => {
    if (err) return renderProfile(res, { passwordState: { success: true } });
    req.session.userId = user._id;
    req.session.save(() => renderProfile(res, { passwordState: { success: true } }));
  });
});

module.exports = router;
