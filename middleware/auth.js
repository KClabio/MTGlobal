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

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.redirect('/dang-nhap');
  }
  if (!isStaff(req.user.role)) {
    return res.status(403).render('403');
  }
  next();
}

module.exports = { loadUser, requireAuth, requireAdmin };
