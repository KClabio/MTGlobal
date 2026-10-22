require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const mongoose = require('mongoose');
const path = require('path');

const connectDB = require('./config/db');
const { loadUser } = require('./middleware/auth');
const { loadLanguage } = require('./lib/i18n');
const { loadSiteSettings } = require('./lib/settings');
const { startRetention } = require('./lib/retention');

const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/account');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mtglobal_db';

// Login cookie secret: never a value from the (public) code; production refuses to start without a proper one
const sessionSecret = require('./lib/session-secret').resolveSessionSecret();
if (sessionSecret.error) {
  console.error(sessionSecret.error);
  process.exit(1);
}
if (sessionSecret.warning) console.warn(sessionSecret.warning);

if (process.env.NODE_ENV === 'production') {
  if (!process.env.MONGO_URI) {
    console.error('Missing required production env var: MONGO_URI');
    process.exit(1);
  }
  if (!process.env.CLOUDINARY_CLOUD_NAME) {
    console.warn('Cloudinary not configured — uploads will be stored on local disk and may be lost on redeploy.');
  }
}

app.set('view engine', 'ejs');
app.locals.formatText = require('./lib/text').plainTextToHtml; // plain-text fields -> paragraphs / lists
app.locals.excerpt = require('./lib/text').excerpt; // one-line previews (cards)
app.locals.parseContacts = require('./lib/text').parseContacts; // partner contact lines -> mailto:/tel: links
app.locals.slugify = require('./lib/text').slugify; // in-page anchors (Giải pháp jump menu)
app.locals.buildSolutionLinks = require('./lib/home-domains').buildSolutionLinks; // "Khám phá thêm" cards (partials/next-steps.ejs)
app.locals.bannerFor = require('./lib/banners').bannerFor; // page banner line + background (Admin → Cài đặt chung)
app.locals.LEVELS = require('./lib/project-levels').LEVELS; // school levels of the reference projects
app.locals.levelFromSchool = require('./lib/project-levels').levelFromSchool;
app.locals.INTEREST_GROUPS = require('./models/QuoteRequest').INTEREST_GROUPS; // "Bạn quan tâm đến" list (partials/quote-form.ejs)
app.locals.isProductLine = require('./models/QuoteRequest').isProductLine; // robot name shown with the category (request lists)
app.locals.googleEnabled = require('./lib/google-auth').isConfigured(); // "Đăng nhập bằng Google" button (login, register)
// Behind the host's HTTPS proxy (lib/trust-proxy.js turns TRUST_PROXY=1 into the number Express expects)
const trustProxy = require('./lib/trust-proxy').parseTrustProxy(process.env.TRUST_PROXY);
if (trustProxy !== undefined) app.set('trust proxy', trustProxy);

// Browser protections on every page and file (lib/security-headers.js); "X-Powered-By: Express" is not sent
app.disable('x-powered-by');
app.use(require('./lib/security-headers').securityHeaders());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
// Light/dark theme preference (shared by the website and the admin), light by default
app.use((req, res, next) => {
  res.locals.theme = req.cookies && req.cookies.theme === 'dark' ? 'dark' : 'light';
  next();
});
// Videos play inside the site's pages only: opening a video file directly in a tab (to save it from there) is refused.
// The page's own player asks with Sec-Fetch-Dest: video and is unaffected.
app.use((req, res, next) => {
  if (/\.(mp4|webm|ogg|ogv|mov|m4v)$/i.test(req.path) && req.get('Sec-Fetch-Dest') === 'document') {
    return res.status(403).type('text').send('Video chỉ xem được trên website. / Videos can only be watched on the website.');
  }
  next();
});
// Speed: compressed text (Brotli/gzip; pictures and videos are already compressed), lighter copies of photos
// (lib/images.js, "?w=800"), the website's styles as one file (lib/assets.js) and, in production, browser caching
const assets = require('./lib/assets').createAssets();
app.locals.asset = assets.asset; // '/js/main.js' -> '/js/main.js?v=<fingerprint>'
app.locals.picture = require('./lib/picture').picture; // <img> with srcset (views)
app.locals.resized = require('./lib/picture').resized; // one picture address at a width (banners, thumbnails)
app.use(require('compression')({ threshold: 1024 }));
app.use(require('./lib/images').createImages());
app.use(assets.bundleRoute);
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: assets.staticHeaders }));
// Drag-and-drop library for the admin lists, served from node_modules (no CDN)
app.get('/vendor/sortable.min.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules', 'sortablejs', 'Sortable.min.js'), { maxAge: '7d' });
});

app.get('/health', (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({ status: dbConnected ? 'ok' : 'db_disconnected' });
});

// For search engines (lib/sitemap.js): robots.txt needs no database; the sitemap lists every public page in VI + EN
const seo = require('./lib/sitemap');
app.get('/robots.txt', seo.robotsRoute);

// Database unreachable: pages answer at once with "Website đang tạm gián đoạn" (503) instead of hanging (lib/db-guard.js)
const dbGuard = require('./lib/db-guard');
app.use(dbGuard.dbGuard());
app.get('/sitemap.xml', seo.createSitemapRoute());

app.use(session({
  secret: sessionSecret.secret,
  resave: false,
  saveUninitialized: false,
  // Gives up after 5 s (not 30) if the database goes away while a visit is being answered
  store: MongoStore.create({ mongoUrl: MONGO_URI, mongoOptions: { serverSelectionTimeoutMS: 5000 } }),
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7,
    secure: process.env.SESSION_COOKIE_SECURE === 'true',
    sameSite: 'lax',
  },
}));

app.use(loadUser);
app.use(loadLanguage);
app.use(loadSiteSettings);
// Opened from a card in the home page "Lĩnh vực hoạt động" slider: the page banner shows "← Về trang chủ"
app.use((req, res, next) => {
  res.locals.fromHome = req.method === 'GET' && req.query.from === 'home';
  next();
});
// Right after logging in (routes/auth.js): the next page shows "Đăng nhập thành công" once (partials/footer.ejs)
// (and right after "Xóa tài khoản": "Tài khoản của bạn đã được xoá" once)
app.use((req, res, next) => {
  res.locals.loginNotice = null;
  res.locals.deletedNotice = false;
  if (req.session && req.session.accountDeleted && req.method === 'GET' && req.accepts('html')) {
    res.locals.deletedNotice = true;
    delete req.session.accountDeleted;
  }
  if (req.session && req.session.justLoggedIn && req.method === 'GET' && req.accepts('html') && req.user) {
    res.locals.loginNotice = req.user.name;
    delete req.session.justLoggedIn;
  }
  next();
});

app.use('/', indexRoutes);
app.use('/', authRoutes);
app.use('/tai-khoan', accountRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => {
  res.status(404).render('404');
});

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  if (dbGuard.isDbUnavailable(err)) return dbGuard.sendUnavailable(res);
  res.status(500).render('500');
});

connectDB()
  .then(() => {
    startRetention(); // deletes requests older than 24 months, now and daily
    app.listen(PORT, () => {
      console.log(`MTGlobal server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => console.error('MongoDB connection error:', err));
