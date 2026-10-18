const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const router = express.Router();

const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { uploadAvatar, AVATAR_MAX_BYTES, isRealImageFile, fileUrl, wrapUpload, removeLocalUpload } = require('../middleware/upload');
const { isValidEmail, isValidPhone, isNonEmpty } = require('../lib/validators');
const google = require('../lib/google-auth');

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
  const values = { name: field('name'), email: field('email').toLowerCase(), phone: field('phone'), schoolOrCompany: field('schoolOrCompany') };
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
  const user = email ? await User.findOne({ email }) : null;
  // An account made with Google has no password until its owner sets one on the profile page
  const ok = user && user.passwordHash && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) {
    return res.status(400).render('login', { error: res.locals.t('auth.errLogin'), registered: false, email, needLogin: forRequest(req) });
  }
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
  if (!user) user = new User({ googleId: profile.googleId, email: profile.email, name: profile.name });

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
    removeLocalUpload(newAvatar); // don't keep a photo from a rejected submit
    return renderProfile(res, { status: 400, profileState: { error }, values });
  }

  const update = { ...values };
  const previousAvatar = req.user.avatar;
  if (newAvatar) Object.assign(update, { avatar: newAvatar, avatarMode: 'own' }); // an uploaded photo isn't replaced by Google

  const updated = await User.findByIdAndUpdate(req.user._id, update, { returnDocument: 'after', runValidators: true }).lean();
  if ('avatar' in update && previousAvatar && previousAvatar !== update.avatar) removeLocalUpload(previousAvatar);

  res.locals.user = updated;
  renderProfile(res, { profileState: { success: true } });
}));

// "Xóa ảnh": back to the two letters of the name; a Google photo stays away at later Google logins (avatarMode 'none')
router.post('/ho-so/anh-dai-dien/xoa', requireAuth, async (req, res) => {
  const previousAvatar = req.user.avatar;
  const updated = await User.findByIdAndUpdate(req.user._id, { avatar: null, avatarMode: 'none' }, { returnDocument: 'after' }).lean();
  removeLocalUpload(previousAvatar);
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

module.exports = router;
