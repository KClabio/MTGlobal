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
const errorLog = require('./lib/error-log');

const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/account');
const adminRoutes = require('./routes/admin');

// Errors outside any page (a forgotten await, a timer): logged like page errors (lib/error-log.js). After an uncaught
// exception the server is in an unknown state, so it stops once the error is saved; the host then starts it again.
process.on('unhandledRejection', (reason) => { errorLog.record(reason, { where: 'Unhandled promise rejection' }); });
process.on('uncaughtException', (err) => {
  const timeout = new Promise((resolve) => setTimeout(resolve, 3000).unref());
  Promise.race([errorLog.record(err, { where: 'Uncaught exception' }), timeout]).finally(() => process.exit(1));
});

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
// Staff two-step login keys are stored locked with a key taken from the same secret (lib/two-factor.js)
require('./lib/two-factor').init(sessionSecret.secret);

if (process.env.NODE_ENV === 'production') {
  if (!process.env.MONGO_URI) {
    console.error('Missing required production env var: MONGO_URI');
    process.exit(1);
  }
}
for (const warning of require('./lib/production-checks').productionWarnings()) console.warn(`Live server setting: ${warning}`);

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
app.locals.chatLinks = require('./lib/chat-links').chatLinks; // Zalo / Messenger links (partials/chat-button.ejs, footer, Liên hệ)
app.locals.QUOTE_MESSAGE_MAX = require('./lib/quote-request').MESSAGE_MAX; // request message limit + counter (partials/quote-form.ejs)
app.locals.googleEnabled = require('./lib/google-auth').isConfigured(); // "Đăng nhập bằng Google" button (login, register)
// Behind the host's HTTPS proxy (lib/trust-proxy.js turns TRUST_PROXY=1 into the number Express expects)
const trustProxy = require('./lib/trust-proxy').parseTrustProxy(process.env.TRUST_PROXY);
if (trustProxy !== undefined) app.set('trust proxy', trustProxy);

// Browser protections on every page and file (lib/security-headers.js); "X-Powered-By: Express" is not sent
app.disable('x-powered-by');
app.use(require('./lib/security-headers').securityHeaders());
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
app.locals.pageMeta = require('./lib/seo').pageMeta; // description, canonical and link-preview tags (partials/header.ejs)
app.locals.searchTitle = require('./lib/seo').searchTitle; // the <title> tag: a long name shortened for Google
app.locals.structuredData = require('./lib/structured-data').structuredData; // company card + breadcrumbs for Google (header.ejs)
app.locals.jsonForScript = require('./lib/structured-data').jsonForScript;
app.use(require('compression')({ threshold: 1024 }));
app.use(require('./lib/images').createImages());
app.use(assets.bundleRoute);
app.use(assets.scriptRoute); // main.js, admin.js, theme.js minified on the live server
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
// The site's address and this page's path, for the canonical and link-preview tags (lib/seo.js)
app.use((req, res, next) => { res.locals.siteBase = seo.siteBase(req); res.locals.pagePath = req.path; next(); });
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
    res.locals.googleJoinedNotice = !!req.session.googleJoined;
    delete req.session.justLoggedIn;
    delete req.session.googleJoined;
  }
  next();
});

// Form posts from another website are refused before anything is read or saved (lib/same-origin.js)
app.use(require('./lib/same-origin').sameOriginPosts);

// Form and JSON bodies are read last, once the visitor's language and the site settings are known: a body too big
// to read then gets a clear page in the right language (error handler below), not the general error page
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
// A POST without any form data (robots, scripts) leaves req.body undefined in Express 5: treat it as an empty form,
// so it gets the normal "please fill in" answer instead of a server error
app.use((req, res, next) => { if (req.body === undefined) req.body = {}; next(); });

app.use(require('./lib/page-views').countPageViews); // visits per public page and day, for the admin overview
app.use('/', indexRoutes);
app.use('/', authRoutes);
app.use('/tai-khoan', accountRoutes);
app.use('/admin', adminRoutes);

// Tests only (tests/run.mjs sets ERROR_TEST_ROUTE): a page that fails, to check the error log and the alert email
if (process.env.ERROR_TEST_ROUTE === '1') {
  app.get('/__test/boom', () => { throw new Error('ZZ test error'); });
}

app.use((req, res) => {
  res.status(404).render('404');
});

// The page the visitor came from on this site (for "← Quay lại"), else Trang chủ; never an outside address
function sameSiteReferer(req) {
  try {
    const ref = new URL(req.get('Referer') || '', `${req.protocol}://${req.get('host')}`);
    if (ref.host === req.get('host')) return ref.pathname + ref.search;
  } catch (err) { /* no or malformed Referer */ }
  return '/';
}

app.use((err, req, res, next) => {
  // A form (or admin order list) bigger than the server takes (express's 100 KB limit): say so plainly, not "something went wrong"
  if (err && err.type === 'entity.too.large' && !res.headersSent) {
    if (req.is('json') || req.path.startsWith('/admin/thu-tu/')) return res.status(413).json({ ok: false });
    return res.status(413).render('413', { backHref: sameSiteReferer(req) });
  }
  errorLog.record(err, { req });
  if (res.headersSent) return next(err);
  if (dbGuard.isDbUnavailable(err)) return dbGuard.sendUnavailable(res);
  res.status(500).render('500');
});

connectDB()
  .then(() => {
    startRetention(); // deletes requests older than 24 months, now and daily
    const server = app.listen(PORT, (err) => {
      if (err) {
        console.error(`Could not start on port ${PORT}:`, err.message);
        process.exit(1);
      }
      console.log(`MTGlobal server running at http://localhost:${PORT}`);
    });
    const { gracefulStop, stopOnSignals } = require('./lib/graceful-stop');
    stopOnSignals(gracefulStop({ server, closeDb: () => mongoose.connection.close() }));
  })
  .catch((err) => {
    // Stops rather than stays up without a site, so the host or PM2 starts it again and it tries once more
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });
