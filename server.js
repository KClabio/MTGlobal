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

const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const accountRoutes = require('./routes/account');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/mtglobal_db';

if (process.env.NODE_ENV === 'production') {
  const missing = ['SESSION_SECRET', 'MONGO_URI'].filter((key) => !process.env[key]);
  if (missing.length) {
    console.error(`Missing required production env vars: ${missing.join(', ')}`);
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
if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY);

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
app.use(express.static(path.join(__dirname, 'public')));
// Drag-and-drop library for the admin lists, served from node_modules (no CDN)
app.get('/vendor/sortable.min.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'node_modules', 'sortablejs', 'Sortable.min.js'), { maxAge: '7d' });
});

app.get('/health', (req, res) => {
  const dbConnected = mongoose.connection.readyState === 1;
  res.status(dbConnected ? 200 : 503).json({ status: dbConnected ? 'ok' : 'db_disconnected' });
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'mtglobal-dev-secret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI }),
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
  res.status(500).render('500');
});

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`MTGlobal server running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => console.error('MongoDB connection error:', err));
