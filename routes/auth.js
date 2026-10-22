const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const router = express.Router();

const mongoose = require('mongoose');
const User = require('../models/User');
const QuoteRequest = require('../models/QuoteRequest');
const { requireAuth } = require('../middleware/auth');
const { uploadAvatar, AVATAR_MAX_BYTES, isRealImageFile, fileUrl, wrapUpload, removeUpload } = require('../middleware/upload');
const { isValidEmail, isValidPhone, isNonEmpty } = require('../lib/validators');
const google = require('../lib/google-auth');
const throttle = require('../lib/login-throttle');
const { isStaff } = require('../lib/roles');

const PASSWORD_MIN = 6;

// Sign-up gatekeeping (the browser checks the same first: public/js/main.js, [data-register-form]): name required,
// a valid email, a phone only if it looks like one (phone and school are optional), a long enough password typed twice
function validateRegistration(values, password, confirmPassword, t) {
  const errors = {};
  if (!isNonEmpty(values.name)) errors.name = t('forms.errName');
  if (!values.email) errors.email = t('auth.errEmailRequired');
  else if (!isValidEmail(values.email)) errors.email = t('forms.errEmail');
  if (values.phone && !isValidPhone(values.phone)) errors.phone = t('forms.errPhone');
  if (!password) errors.password = t('auth.errPasswordRequired');
  else if (password.length < PASSWORD_MIN) errors.password = t('auth.errPasswordLength');
  if (!confirmPassword) errors.confirmPassword = t('auth.errConfirmRequired');
  else if (password && password !== confirmPassword) errors.confirmPassword = t('auth.errPasswordMatch');
  if (!values.agreePrivacy) errors.agreePrivacy = t('privacy.errAgree'); // consent to the Chính sách bảo mật (Decree 13)
  return errors;
}

// ?yeu-cau=1: sent here by a consultation request while logged out (routes/index.js): the page says so
const forRequest = (req) => req.query['yeu-cau'] === '1' || req.body?.forRequest === '1';

router.get('/dang-ky', (req, res) => {
  res.render('register', { error: null, errors: {}, values: {}, needLogin: forRequest(req) });
});

router.post('/dang-ky', async (req, res) => {
  const t = res.locals.t;
  const field = (key) => (typeof req.body[key] === 'string' ? req.body[key].trim() : '');
  const values = { name: field('name'), email: field('email').toLowerCase(), phone: field('phone'), schoolOrCompany: field('schoolOrCompany'), agreePrivacy: field('agreePrivacy') !== '' };
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';

  const errors = validateRegistration(values, password, confirmPassword, t);
  if (!errors.email && (await User.exists({ email: values.email }))) errors.email = t('auth.errEmailTaken');
  if (Object.keys(errors).length) {
    return res.status(400).render('register', { error: t('forms.errSummary'), errors, values, needLogin: forRequest(req) });
  }

  await User.create({
    name: values.name,
    email: values.email,
    passwordHash: await bcrypt.hash(password, 10),
    phone: values.phone,
    schoolOrCompany: values.schoolOrCompany,
    privacyAcceptedAt: new Date(),
  });

  // Signing up doesn't log in: the login page welcomes them with the new email filled in; logging in leads to Trang chủ
  req.session.justRegistered = values.email;
  res.redirect(303, '/dang-nhap');
});

router.get('/dang-nhap', (req, res) => {
  const registered = req.session.justRegistered || null;
  delete req.session.justRegistered;
  res.render('login', { error: null, registered: !!registered, email: registered || '', needLogin: forRequest(req) });
});

// Everyone (customer, admin, owner) lands on Trang chủ after logging in; staff open "Quản trị" from their name menu.
// A fresh session id at login; Trang chủ then says "Đăng nhập thành công" (server.js, partials/footer.ejs)
function logIn(req, res, user) {
  req.session.regenerate((err) => {
    if (err) return res.status(500).render('login', { error: res.locals.t('auth.errLogin'), registered: false, email: user.email, needLogin: false });
    req.session.userId = user._id;
    req.session.justLoggedIn = true;
    req.session.save(() => res.redirect(303, '/'));
  });
}

router.post('/dang-nhap', async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  // Too many wrong passwords lately (lib/login-throttle.js): refused before the password is even checked
  const wait = await throttle.check(email, req.ip);
  if (wait) {
    return res.status(429).render('login', { error: res.locals.t('auth.errTooMany', { minutes: wait }), registered: false, email, needLogin: forRequest(req) });
  }
  const user = email ? await User.findOne({ email }) : null;
  // An account made with Google has no password until its owner sets one on the profile page
  const ok = user && user.passwordHash && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) {
    await throttle.fail(email, req.ip);
    return res.status(400).render('login', { error: res.locals.t('auth.errLogin'), registered: false, email, needLogin: forRequest(req) });
  }
  await throttle.succeed(email);
  logIn(req, res, user);
});

// "Đăng nhập bằng Google" (lib/google-auth.js). Name, email and photo are copied from Google at every Google login;
// an existing account with the same email is joined (role, requests and password kept).
const googleFailed = (req, res, key, status = 400) =>
  res.status(status).render('login', { error: res.locals.t(key), registered: false, email: '', needLogin: false });

router.get('/dang-nhap/google', (req, res) => {
  if (!google.isConfigured()) return googleFailed(req, res, 'auth.googleOff', 404);
  req.session.googleState = crypto.randomBytes(16).toString('hex'); // checked on the way back (stops forged logins)
  req.session.save(() => res.redirect(google.authUrl(google.redirectUri(req), req.session.googleState)));
});

router.get(google.CALLBACK_PATH, async (req, res) => {
  const expected = req.session.googleState;
  delete req.session.googleState;
  if (!google.isConfigured()) return googleFailed(req, res, 'auth.googleOff', 404);
  if (req.query.error) return googleFailed(req, res, 'auth.googleCancelled');
  if (!expected || req.query.state !== expected || typeof req.query.code !== 'string') return googleFailed(req, res, 'auth.googleFailed');

  let profile;
  try {
    profile = await google.fetchProfile(req.query.code, google.redirectUri(req));
  } catch (err) {
    console.error('Google login:', err.message);
    return googleFailed(req, res, 'auth.googleFailed', 502);
  }
  if (!profile.emailVerified) return googleFailed(req, res, 'auth.googleUnverified');

  let user = await User.findOne({ googleId: profile.googleId });
  if (!user) {
    user = await User.findOne({ email: profile.email });
    if (user && user.googleId) return googleFailed(req, res, 'auth.googleOtherAccount'); // that email is joined to another Google account
    if (user) {
      user.googleId = profile.googleId;
      if (user.avatar) user.avatarMode = 'own'; // a photo uploaded before joining stays
    }
  }
  // A new account agrees to the Chính sách bảo mật by continuing (the notice under the Google button)
  if (!user) user = new User({ googleId: profile.googleId, email: profile.email, name: profile.name, privacyAcceptedAt: new Date() });

  user.name = profile.name;
  if (user.email !== profile.email && !(await User.exists({ email: profile.email, _id: { $ne: user._id } }))) user.email = profile.email;
  if (user.avatarMode === '') user.avatar = profile.picture;
  await user.save();
  logIn(req, res, user);
});

router.post('/dang-xuat', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

const BIO_MAX = 500;

function renderProfile(res, { status = 200, profileState = {}, passwordState = {}, deleteState = {}, values = null } = {}) {
  res.status(status).render('profile', { profileState, passwordState, deleteState, values, avatarMaxBytes: AVATAR_MAX_BYTES });
}

router.get('/ho-so', requireAuth, (req, res) => {
  renderProfile(res);
});

router.post('/ho-so', requireAuth, wrapUpload(uploadAvatar, async (req, res) => {
  const t = res.locals.t;
  const field = (key) => (typeof req.body[key] === 'string' ? req.body[key].trim() : '');
  // Forms submit line breaks as \r\n; store \n so the length matches the textarea's own 500-character count
  const values = { name: field('name'), phone: field('phone'), schoolOrCompany: field('schoolOrCompany'), bio: field('bio').replace(/\r\n?/g, '\n') };
  if (req.user.googleId) values.name = req.user.name; // a Google account's name comes from Google (locked on the page)
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
    removeUpload(newAvatar); // don't keep a photo from a rejected submit
    return renderProfile(res, { status: 400, profileState: { error }, values });
  }

  const update = { ...values };
  const previousAvatar = req.user.avatar;
  if (newAvatar) Object.assign(update, { avatar: newAvatar, avatarMode: 'own' }); // an uploaded photo isn't replaced by Google

  const updated = await User.findByIdAndUpdate(req.user._id, update, { returnDocument: 'after', runValidators: true }).lean();
  if ('avatar' in update && previousAvatar && previousAvatar !== update.avatar) removeUpload(previousAvatar);

  res.locals.user = updated;
  renderProfile(res, { profileState: { success: true } });
}));

// "Xóa ảnh": back to the two letters of the name; a Google photo stays away at later Google logins (avatarMode 'none')
router.post('/ho-so/anh-dai-dien/xoa', requireAuth, async (req, res) => {
  const previousAvatar = req.user.avatar;
  const updated = await User.findByIdAndUpdate(req.user._id, { avatar: null, avatarMode: 'none' }, { returnDocument: 'after' }).lean();
  removeUpload(previousAvatar);
  res.locals.user = updated;
  renderProfile(res, { profileState: { success: true, message: res.locals.t('profile.avatarRemoved') } });
});

router.post('/ho-so/mat-khau', requireAuth, async (req, res) => {
  const t = res.locals.t;
  const { currentPassword = '', newPassword = '', confirmPassword = '' } = req.body;
  const user = await User.findById(req.user._id);

  // A Google account without a password sets its first one here (no current password to give)
  let error = null;
  if (user.passwordHash && !(await bcrypt.compare(currentPassword, user.passwordHash))) error = t('profile.errCurrentPassword');
  else if (newPassword.length < PASSWORD_MIN) error = t('profile.errPasswordLength');
  else if (newPassword === currentPassword) error = t('profile.errPasswordSame');
  else if (newPassword !== confirmPassword) error = t('profile.errPasswordMatch');
  if (error) return renderProfile(res, { status: 400, passwordState: { error } });

  const firstPassword = !user.passwordHash;
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
  res.locals.user = user.toObject(); // the card now shows "Đổi mật khẩu"
  const done = { success: true, message: firstPassword ? t('profile.passwordSet') : null };

  // New session id after a credential change; keep the user logged in
  req.session.regenerate((err) => {
    if (err) return renderProfile(res, { passwordState: done });
    req.session.userId = user._id;
    req.session.save(() => renderProfile(res, { passwordState: done }));
  });
});

// "Tải dữ liệu của tôi" (Decree 13: a copy of your data): the account and every request sent, as one JSON file.
// Never the password hash, the Google id or database ids.
router.get('/ho-so/du-lieu', requireAuth, async (req, res) => {
  const t = res.locals.t;
  const user = await User.findById(req.user._id).lean();
  const requests = await QuoteRequest.find({ user: user._id }).sort({ createdAt: 1 }).lean();
  const data = {
    website: 'MTG — Mễ Trì Global',
    exportedAt: new Date(),
    account: {
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      schoolOrCompany: user.schoolOrCompany || '',
      bio: user.bio || '',
      avatar: user.avatar || null,
      role: user.role,
      linkedToGoogle: !!user.googleId,
      hasPassword: !!user.passwordHash,
      joinedAt: user.createdAt,
      updatedAt: user.updatedAt,
      privacyAcceptedAt: user.privacyAcceptedAt || null,
    },
    requests: requests.map((r) => ({
      sentAt: r.createdAt,
      updatedAt: r.updatedAt,
      editedAt: r.editedAt || null,
      status: t('admin.status.' + r.status),
      interestedIn: t('admin.interest.' + r.interestedIn),
      name: r.name,
      phone: r.phone,
      email: r.email,
      schoolOrCompany: r.schoolOrCompany,
      message: r.message,
      details: (r.details || []).map((d) => ({ label: d.labelVi, value: d.valueVi, labelEn: d.labelEn, valueEn: d.valueEn })),
      privacyAcceptedAt: r.privacyAcceptedAt || null,
    })),
  };
  res.set('Cache-Control', 'no-store');
  res.attachment(`mtg-du-lieu-${new Date().toISOString().slice(0, 10)}.json`);
  res.type('application/json').send(JSON.stringify(data, null, 2));
});

// "Xóa tài khoản": a customer deletes their own account, photo and requests for good (owner's choice, 22 Oct 2026).
// Confirmed with the password, or the email address for a Google account without one. Staff accounts are managed in the admin.
router.post('/ho-so/xoa-tai-khoan', requireAuth, async (req, res) => {
  const t = res.locals.t;
  if (isStaff(req.user.role)) return res.status(403).render('403');
  const user = await User.findById(req.user._id);
  const confirm = typeof req.body.confirm === 'string' ? req.body.confirm : '';
  const confirmed = user.passwordHash
    ? await bcrypt.compare(confirm, user.passwordHash)
    : confirm.trim().toLowerCase() === user.email.toLowerCase();
  if (!confirmed) {
    const error = user.passwordHash ? t('profile.errCurrentPassword') : t('privacy.errDeleteEmail');
    return renderProfile(res, { status: 400, deleteState: { error } });
  }

  await QuoteRequest.deleteMany({ user: user._id });
  await mongoose.connection.collection('sessions').deleteMany({ session: { $regex: `"userId":"${user._id}"` } });
  removeUpload(user.avatar);
  await User.deleteOne({ _id: user._id });

  // A fresh, logged-out session carries the one-time "Tài khoản đã được xoá" notice (server.js, partials/footer.ejs)
  req.session.regenerate((err) => {
    if (err) return res.redirect('/');
    req.session.accountDeleted = true;
    req.session.save(() => res.redirect('/'));
  });
});

module.exports = router;
