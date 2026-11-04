const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const router = express.Router();

const User = require('../models/User');
const QuoteRequest = require('../models/QuoteRequest');
const { requireAuth } = require('../middleware/auth');
const { uploadAvatar, AVATAR_MAX_BYTES, isRealImageFile, fileUrl, wrapUpload, removeUpload } = require('../middleware/upload');
const { isValidEmail, isValidPhone, isNonEmpty } = require('../lib/validators');
const google = require('../lib/google-auth');
const throttle = require('../lib/login-throttle');
const passwordReset = require('../lib/password-reset');
const { endAllSessions } = require('../lib/sessions');
const errorLog = require('../lib/error-log');
const { isStaff } = require('../lib/roles');
const { passwordProblem } = require('../lib/passwords');
const twoFactor = require('../lib/two-factor');
const QRCode = require('qrcode');

// Sign-up gatekeeping (the browser checks the same first: public/js/main.js, [data-register-form]): name required,
// a valid email, a phone only if it looks like one (phone and school are optional), a long enough password typed twice
// (and not a common one: lib/passwords.js, checked here only)
function validateRegistration(values, password, confirmPassword, t) {
  const errors = {};
  if (!isNonEmpty(values.name)) errors.name = t('forms.errName');
  if (!values.email) errors.email = t('auth.errEmailRequired');
  else if (!isValidEmail(values.email)) errors.email = t('forms.errEmail');
  if (values.phone && !isValidPhone(values.phone)) errors.phone = t('forms.errPhone');
  if (!password) errors.password = t('auth.errPasswordRequired');
  else if (passwordProblem(password) === 'length') errors.password = t('auth.errPasswordLength');
  else if (passwordProblem(password) === 'common') errors.password = t('auth.errPasswordCommon');
  if (!confirmPassword) errors.confirmPassword = t('auth.errConfirmRequired');
  else if (password && password !== confirmPassword) errors.confirmPassword = t('auth.errPasswordMatch');
  if (!values.agreePrivacy) errors.agreePrivacy = t('privacy.errAgree'); // consent to the Chính sách bảo mật (Decree 13)
  return errors;
}

// ?yeu-cau=1: sent here from a request form's "Đăng nhập" line (partials/quote-form.ejs): the page says so
const forRequest = (req) => req.query['yeu-cau'] === '1' || req.body?.forRequest === '1';

// ?ve=<page>: after logging in (or signing up, then logging in), back to that request form. Only the pages that have
// one are accepted, so the link can't send anyone to another site.
const RETURN_PATH = /^\/(lien-he(\?quan_tam=[a-z-]+)?|san-pham\/[a-z0-9-]+|dich-vu\/[a-z0-9-]+)$/;
function rememberReturn(req) {
  const path = req.query.ve;
  if (typeof path === 'string' && RETURN_PATH.test(path)) req.session.returnTo = path;
}

router.get('/dang-ky', (req, res) => {
  rememberReturn(req);
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

  try {
    await User.create({
      name: values.name,
      email: values.email,
      passwordHash: await bcrypt.hash(password, 10),
      phone: values.phone,
      schoolOrCompany: values.schoolOrCompany,
      privacyAcceptedAt: new Date(),
    });
  } catch (err) {
    // The same email sent twice at the same moment: both pass the check above, the unique index refuses the second
    if (err.code !== 11000) throw err;
    return res.status(400).render('register', { error: t('forms.errSummary'), errors: { email: t('auth.errEmailTaken') }, values, needLogin: forRequest(req) });
  }

  // Signing up doesn't log in: the login page welcomes them with the new email filled in; logging in leads to Trang chủ
  req.session.justRegistered = values.email;
  res.redirect(303, '/dang-nhap');
});

router.get('/dang-nhap', (req, res) => {
  rememberReturn(req);
  const registered = req.session.justRegistered || null;
  delete req.session.justRegistered;
  const resetEmail = req.session.passwordWasReset || null;
  delete req.session.passwordWasReset;
  res.render('login', { error: null, registered: !!registered, resetDone: !!resetEmail, email: registered || resetEmail || '', needLogin: forRequest(req) });
});

// Everyone (customer, admin, owner) lands on Trang chủ after logging in, or back on the request form they came from
// (rememberReturn); staff open "Quản trị" from their name menu.
// A fresh session id at login; Trang chủ then says "Đăng nhập thành công" (server.js, partials/footer.ejs).
// Staff (owner, admin) are not logged in yet: they go on to the two-step code page (below), half-way for 10 minutes.
function logIn(req, res, user, { googleJoined = false } = {}) {
  const back = req.session.returnTo ? `${req.session.returnTo}#yeu-cau` : '/';
  req.session.regenerate((err) => {
    if (err) return res.status(500).render('login', { error: res.locals.t('auth.errLogin'), registered: false, email: user.email, needLogin: false });
    if (isStaff(user.role)) {
      req.session.twoStep = { userId: String(user._id), back, at: Date.now(), googleJoined };
      return req.session.save(() => res.redirect(303, '/dang-nhap/xac-minh'));
    }
    req.session.userId = user._id;
    req.session.justLoggedIn = true;
    if (googleJoined) req.session.googleJoined = true;
    req.session.save(() => res.redirect(303, back));
  });
}

// ---- Two-step login for staff (lib/two-factor.js) ----
// /dang-nhap/xac-minh asks for the code from the authenticator app (or a backup code); an account without two-step yet
// (first login after the change, or a customer just made admin) sets it up there first: QR code, key, one code to
// confirm, then the 10 backup codes once (/dang-nhap/ma-du-phong). "Đổi điện thoại" on Hồ sơ uses the same setup.

/** The half-finished login of this session: { p, user }, or null when there is none, it is older than 10 minutes,
 *  or the account is gone or no longer staff */
async function pendingStep(req) {
  const p = req.session.twoStep;
  if (!p || !p.userId || Date.now() - p.at > twoFactor.PENDING_MS) return null;
  const user = await User.findById(p.userId).catch(() => null);
  if (!user || !isStaff(user.role)) return null;
  return { p, user };
}

const isSetup = (p, user) => !!p.change || !twoFactor.isEnabled(user);

async function renderTwoStep(req, res, { p, user }, { status = 200, error = null, helpOpen = false } = {}) {
  const view = { mode: p.change ? 'change' : isSetup(p, user) ? 'setup' : 'verify', error, email: user.email, role: user.role, helpOpen };
  if (view.mode !== 'verify') {
    if (!twoFactor.open(p.newSecret)) {
      p.newSecret = twoFactor.seal(twoFactor.newSecret()); // one key per setup visit: a reload shows the same QR code
      await new Promise((resolve) => req.session.save(resolve));
    }
    const secret = twoFactor.open(p.newSecret);
    view.qr = await QRCode.toDataURL(twoFactor.otpauthUri(user.email, secret), { margin: 1, width: 220, errorCorrectionLevel: 'M' });
    view.key = twoFactor.groupKey(secret);
  }
  res.set('Cache-Control', 'no-store');
  res.status(status).render('two-step', view);
}

/** Log the staff member in for real: a new session id, marked as having passed the code */
function finishTwoStep(req, res, userId, target, extra = {}) {
  req.session.regenerate((err) => {
    if (err) return res.redirect(303, '/dang-nhap');
    Object.assign(req.session, { userId, twoStepOk: true, justLoggedIn: true }, extra);
    req.session.save(() => res.redirect(303, target));
  });
}

/**
 * The message for a refused app code. A code from a nearby time (r.offBy) means the server's or the phone's clock is
 * wrong: the page says so, and it goes to Nhật ký lỗi (the server's clock may need fixing)
 */
function codeRefusedText(req, res, r) {
  const t = res.locals.t;
  if (r.reused) return t('twoStep.errReused');
  if (!r.offBy) return t('twoStep.errWrong');
  const seconds = Math.abs(r.offBy);
  errorLog.record(new Error(`Two-step code refused: the server and phone clocks differ by about ${seconds} s (phone ${r.offBy > 0 ? 'ahead' : 'behind'})`),
    { req, where: 'Two-step login', status: 400 });
  return t('twoStep.errClock', { seconds });
}

/**
 * Checks a typed code for an account with two-step set up: a 6-digit app code (never one already used), or, when
 * allowed, one backup code (used up). Counts wrong codes (5 → 15 minutes' wait).
 * → { ok } or { status, error, openHelp } (openHelp: the clocks differ or too many tries: the code page opens its guide)
 */
async function checkStaffCode(req, res, user, code, { allowBackup }) {
  const t = res.locals.t;
  const wait = await throttle.checkCode(String(user._id), req.ip);
  if (wait) return { status: 429, error: t('auth.errTooMany', { minutes: wait }), openHelp: true };
  const tf = user.twoFactor;
  if (allowBackup) {
    const i = twoFactor.findBackup(tf.backupCodes, code);
    if (i >= 0) {
      tf.backupCodes.splice(i, 1);
      await user.save();
      await throttle.succeedCode(String(user._id));
      return { ok: true, usedBackup: true };
    }
  }
  const r = twoFactor.checkCode(twoFactor.open(tf.secret), code, { lastStep: tf.lastStep });
  if (!r.ok) {
    await throttle.failCode(String(user._id), req.ip);
    return { status: 400, error: codeRefusedText(req, res, r), openHelp: !!r.offBy };
  }
  tf.lastStep = r.step;
  await user.save();
  await throttle.succeedCode(String(user._id));
  return { ok: true };
}

/** The code page again after a refused code: from the 2nd refusal of this login on, its "Không nhập được mã?" guide is open */
function refused(req, res, pending, { status, error, openHelp }) {
  const p = pending.p;
  p.misses = (p.misses || 0) + 1; // kept with the half-finished login in the session, gone with it
  return renderTwoStep(req, res, pending, { status, error, helpOpen: openHelp || p.misses >= 2 });
}

const expired = (req, res) => {
  delete req.session.twoStep;
  res.status(400).render('login', { error: res.locals.t('twoStep.expired'), registered: false, email: '', needLogin: false });
};

router.get('/dang-nhap/xac-minh', async (req, res) => {
  const pending = await pendingStep(req);
  if (!pending) return expired(req, res);
  renderTwoStep(req, res, pending);
});

router.post('/dang-nhap/xac-minh', async (req, res) => {
  const pending = await pendingStep(req);
  if (!pending) return expired(req, res);
  const { p, user } = pending;
  const code = typeof req.body.code === 'string' ? req.body.code.trim() : '';

  if (!isSetup(p, user)) {
    const r = await checkStaffCode(req, res, user, code, { allowBackup: true });
    if (!r.ok) return refused(req, res, pending, r);
    return finishTwoStep(req, res, user._id, p.back || '/', p.googleJoined ? { googleJoined: true } : {});
  }

  // Setup (or a new phone): one correct code from the new key turns it on; new backup codes replace any old ones
  const wait = await throttle.checkCode(String(user._id), req.ip);
  if (wait) return refused(req, res, pending, { status: 429, error: res.locals.t('auth.errTooMany', { minutes: wait }), openHelp: true });
  const secret = twoFactor.open(p.newSecret);
  const r = secret ? twoFactor.checkCode(secret, code) : { ok: false };
  if (!r.ok) {
    await throttle.failCode(String(user._id), req.ip);
    return refused(req, res, pending, { status: 400, error: codeRefusedText(req, res, r), openHelp: !!r.offBy });
  }
  const { codes, hashes } = twoFactor.newBackupCodes();
  user.twoFactor = { secret: p.newSecret, enabledAt: new Date(), backupCodes: hashes, lastStep: r.step };
  await user.save();
  await throttle.succeedCode(String(user._id));
  // No "Đăng nhập thành công" notice here: on a phone it would cover the codes, and the page says it is ready
  finishTwoStep(req, res, user._id, '/dang-nhap/ma-du-phong', { newBackupCodes: codes, backupCodesNext: p.back || '/', justLoggedIn: false });
});

// The new backup codes, shown once (a reload sends you on): download as a text file, print, or copy them
router.get('/dang-nhap/ma-du-phong', requireAuth, (req, res) => {
  const codes = req.session.newBackupCodes;
  const next = req.session.backupCodesNext || '/';
  if (!Array.isArray(codes) || !codes.length) {
    delete req.session.backupCodesNext; // a reload after the codes were shown: on to the page that was asked for
    return req.session.save(() => res.redirect(/^\/(?!\/)/.test(next) ? next : '/'));
  }
  delete req.session.newBackupCodes; // the codes themselves only once
  res.set('Cache-Control', 'no-store');
  req.session.save(() => res.render('two-step-codes', { codes, next }));
});

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

// "Quên mật khẩu" (lib/password-reset.js)
function renderForgot(res, { status = 200, sent = false, error = null, email = '' } = {}) {
  res.status(status).render('forgot-password', { available: passwordReset.canSend(), sent, error, email, minutes: passwordReset.LINK_MINUTES });
}

router.get('/quen-mat-khau', (req, res) => renderForgot(res));

router.post('/quen-mat-khau', (req, res) => {
  if (!passwordReset.canSend()) return renderForgot(res);
  const email = typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim() : '';
  if (!isValidEmail(email)) return renderForgot(res, { status: 400, error: res.locals.t('forms.errEmail'), email });
  passwordReset.requestLink(email, { req, lang: res.locals.lang });
  renderForgot(res, { sent: true });
});

function renderReset(res, { status = 200, token = null, error = null } = {}) {
  res.set('Cache-Control', 'no-store');
  res.status(status).render('reset-password', { token, error });
}

router.get('/dat-lai-mat-khau/:token', async (req, res) => {
  const works = await passwordReset.linkWorks(req.params.token);
  renderReset(res, works ? { token: req.params.token } : { status: 410 });
});

router.post('/dat-lai-mat-khau/:token', async (req, res) => {
  const t = res.locals.t;
  const { token } = req.params;
  if (!(await passwordReset.linkWorks(token))) return renderReset(res, { status: 410 });
  const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';
  const confirmPassword = typeof req.body.confirmPassword === 'string' ? req.body.confirmPassword : '';
  let error = null;
  if (passwordProblem(newPassword) === 'length') error = t('profile.errPasswordLength');
  else if (passwordProblem(newPassword) === 'common') error = t('profile.errPasswordCommon');
  else if (newPassword !== confirmPassword) error = t('profile.errPasswordMatch');
  if (error) return renderReset(res, { status: 400, token, error });

  const user = await passwordReset.useLink(token, await bcrypt.hash(newPassword, 10));
  if (!user) return renderReset(res, { status: 410 });
  await endAllSessions(user._id); // whoever else was in this account is out
  await throttle.succeed(user.email); // the email proved who this is: a lock from wrong passwords ends
  passwordReset.tellPasswordChanged(user, { req, lang: res.locals.lang });
  req.session.regenerate((err) => {
    if (err) return res.redirect(303, '/dang-nhap');
    req.session.passwordWasReset = user.email;
    req.session.save(() => res.redirect(303, '/dang-nhap'));
  });
});

// "Đăng nhập bằng Google" (lib/google-auth.js). Name, email and photo are copied from Google at every Google login;
// an existing account with the same email is joined (role and requests kept). Sign-up never proves that an email is
// the person's own, but Google does: so joining removes the old password and ends the account's sessions, in case
// someone else signed up first with this email. The owner can set a new password in Hồ sơ.
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
    errorLog.record(err, { req, where: 'Google login', status: 502 });
    return googleFailed(req, res, 'auth.googleFailed', 502);
  }
  if (!profile.emailVerified) return googleFailed(req, res, 'auth.googleUnverified');

  let googleJoined = false;
  let user = await User.findOne({ googleId: profile.googleId });
  if (!user) {
    user = await User.findOne({ email: profile.email });
    if (user && user.googleId) return googleFailed(req, res, 'auth.googleOtherAccount'); // that email is joined to another Google account
    if (user) {
      user.googleId = profile.googleId;
      googleJoined = !!user.passwordHash;
      user.passwordHash = null;
      if (user.avatar) user.avatarMode = 'own'; // a photo uploaded before joining stays
    }
  }
  // A new account agrees to the Chính sách bảo mật by continuing (the notice under the Google button)
  if (!user) user = new User({ googleId: profile.googleId, email: profile.email, name: profile.name, privacyAcceptedAt: new Date() });

  user.name = profile.name;
  if (user.email !== profile.email && !(await User.exists({ email: profile.email, _id: { $ne: user._id } }))) user.email = profile.email;
  if (user.avatarMode === '') user.avatar = profile.picture;
  await user.save();
  if (googleJoined) await endAllSessions(user._id);
  logIn(req, res, user, { googleJoined });
});

router.post('/dang-xuat', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

const BIO_MAX = 500;

function renderProfile(res, { status = 200, profileState = {}, passwordState = {}, deleteState = {}, twoStepState = {}, values = null } = {}) {
  const u = res.locals.user;
  const tf = u && isStaff(u.role) && u.twoFactor && u.twoFactor.enabledAt ? u.twoFactor : null;
  const twoStep = tf ? { since: tf.enabledAt, backupLeft: (tf.backupCodes || []).length } : null;
  res.status(status).render('profile', { profileState, passwordState, deleteState, twoStepState, twoStep, values, avatarMaxBytes: AVATAR_MAX_BYTES });
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
  else if (passwordProblem(newPassword) === 'length') error = t('profile.errPasswordLength');
  else if (passwordProblem(newPassword) === 'common') error = t('profile.errPasswordCommon');
  else if (newPassword === currentPassword) error = t('profile.errPasswordSame');
  else if (newPassword !== confirmPassword) error = t('profile.errPasswordMatch');
  if (error) return renderProfile(res, { status: 400, passwordState: { error } });

  const firstPassword = !user.passwordHash;
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
  res.locals.user = user.toObject(); // the card now shows "Đổi mật khẩu"
  const done = { success: true, message: firstPassword ? t('profile.passwordSet') : null };

  // Every other device is logged out: whoever else was in this account has to stop being in it
  await endAllSessions(user._id);
  // New session id after a credential change; keep the user logged in (and past the two-step code, for staff)
  const twoStepOk = req.session.twoStepOk;
  req.session.regenerate((err) => {
    if (err) return renderProfile(res, { passwordState: done });
    req.session.userId = user._id;
    if (twoStepOk) req.session.twoStepOk = true;
    req.session.save(() => renderProfile(res, { passwordState: done }));
  });
});

// Hồ sơ → "Đăng nhập 2 bước" (staff with it set up): both actions ask for a current app code first.
//  - "Tạo mã dự phòng mới": 10 new backup codes, the old ones stop working;
//  - "Đổi điện thoại": the setup again (new QR code); the old phone keeps working until the new one is confirmed.
async function staffWithTwoStep(req, res) {
  if (!isStaff(req.user.role)) { res.status(403).render('403'); return null; }
  const user = await User.findById(req.user._id);
  if (!twoFactor.isEnabled(user)) { res.redirect(303, '/admin'); return null; } // not set up yet: Quản trị starts the setup
  return user;
}

router.post('/ho-so/2-buoc/ma-du-phong', requireAuth, async (req, res) => {
  const user = await staffWithTwoStep(req, res);
  if (!user) return;
  const r = await checkStaffCode(req, res, user, String(req.body.code || ''), { allowBackup: false });
  if (!r.ok) return renderProfile(res, { status: r.status, twoStepState: { error: r.error } });
  const { codes, hashes } = twoFactor.newBackupCodes();
  user.twoFactor.backupCodes = hashes;
  await user.save();
  req.session.newBackupCodes = codes;
  req.session.backupCodesNext = '/ho-so';
  req.session.save(() => res.redirect(303, '/dang-nhap/ma-du-phong'));
});

router.post('/ho-so/2-buoc/doi-dien-thoai', requireAuth, async (req, res) => {
  const user = await staffWithTwoStep(req, res);
  if (!user) return;
  const r = await checkStaffCode(req, res, user, String(req.body.code || ''), { allowBackup: false });
  if (!r.ok) return renderProfile(res, { status: r.status, twoStepState: { error: r.error } });
  req.session.twoStep = { userId: String(user._id), back: '/ho-so', at: Date.now(), change: true };
  req.session.save(() => res.redirect(303, '/dang-nhap/xac-minh'));
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
  await endAllSessions(user._id);
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
