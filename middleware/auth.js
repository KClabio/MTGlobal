const User = require('../models/User');
const { isStaff } = require('../lib/roles');

async function loadUser(req, res, next) {
  if (req.session && req.session.userId) {
    try {
      req.user = await User.findById(req.session.userId).lean();
    } catch (err) {
      req.session.userId = null;
    }
  }
  res.locals.user = req.user || null;
  next();
}

// Logged out: to the login page (after logging in, everyone lands on Trang chủ: routes/auth.js)
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.redirect('/dang-nhap');
  }
  next();
}

// Quản trị: staff only, and only once this session has passed the two-step code (routes/auth.js). A staff session from
// before two-step login, or a customer just made admin, is sent to the code page (or its setup) first, then back here.
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.redirect('/dang-nhap');
  }
  if (!isStaff(req.user.role)) {
    return res.status(403).render('403');
  }
  if (!req.session.twoStepOk) {
    const back = req.method === 'GET' && !req.xhr ? req.originalUrl : '/admin';
    req.session.twoStep = { userId: String(req.user._id), back, at: Date.now() };
    return req.session.save(() => res.redirect('/dang-nhap/xac-minh'));
  }
  next();
}

module.exports = { loadUser, requireAuth, requireAdmin };
