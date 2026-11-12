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
const EMAIL_LINKED = /^\/admin\/(yeu-cau(\/[0-9a-f]{24}\/xac-nhan)?|nhat-ky-loi)$/;

function requireAdmin(req, res, next) {
  if (!req.user) {
    // The pages the website's emails link to ("Xác nhận yêu cầu", "Xem trong trang quản trị", "Mở Nhật ký lỗi"): after
    // logging in (and the two-step code), staff come back to that page (routes/auth.js logIn). Anything else, /admin
    // itself included, still lands on Trang chủ as before.
    if (req.method === 'GET' && EMAIL_LINKED.test(req.originalUrl)) {
      req.session.adminBack = req.originalUrl;
      return req.session.save(() => res.redirect('/dang-nhap'));
    }
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
