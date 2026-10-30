// Our own visit counter (owner's choice, 30 Oct 2026, instead of Google Analytics): one count per public page shown,
// per day (models/PageView.js). It sets no cookie and stores no address or visitor id, so it needs no consent banner
// (Decree 13); the Chính sách bảo mật says so. The admin overview shows it with the requests each page brought.
const PageView = require('../models/PageView');
const QuoteRequest = require('../models/QuoteRequest');
const { isStaff } = require('./roles');

const TZ = 'Asia/Ho_Chi_Minh';
const DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
// Not counted: the admin, account and sign-in pages, test pages
const PRIVATE = /^\/(admin|tai-khoan|ho-so|dang-nhap|dang-ky|dang-xuat|__test)(\/|$)/;
// Robots and previews (search engines, link previews, headless browsers). Real browsers all start with "Mozilla/".
const ROBOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|headless|lighthouse|pingdom|uptime/i;

/** '2026-10-30' in Vietnam time */
const dayOf = (date = new Date()) => date.toLocaleDateString('en-CA', { timeZone: TZ });
/** '/San-Pham/robot-cat-co/' → '/san-pham/robot-cat-co' */
const cleanPath = (path) => (String(path || '').toLowerCase().replace(/\/+$/, '') || '/').slice(0, 200);

function shouldCount(req, res) {
  if (req.method !== 'GET' || res.statusCode !== 200) return false;
  if (!/^text\/html/.test(String(res.get('Content-Type') || ''))) return false;
  if (PRIVATE.test(req.path)) return false;
  if (req.user && isStaff(req.user.role)) return false; // staff checking the site
  if (/prefetch|prerender/i.test(`${req.get('Sec-Purpose') || ''} ${req.get('Purpose') || ''}`)) return false;
  const agent = String(req.get('User-Agent') || '');
  return agent.startsWith('Mozilla/') && !ROBOT.test(agent);
}

/** Middleware: counts the page once it has been sent (a lost count never matters, so errors are ignored) */
function countPageViews(req, res, next) {
  res.on('finish', () => {
    if (!shouldCount(req, res)) return;
    PageView.updateOne({ day: dayOf(), path: cleanPath(req.path) }, { $inc: { views: 1 } }, { upsert: true }).catch(() => {});
  });
  next();
}

const round1 = (n) => Math.round(n * 10) / 10;

// The page that brought a request: the page whose form sent it, or for Liên hệ the page opened just before it
const BROUGHT_BY = {
  $cond: [
    { $and: [{ $eq: ['$sourcePage', '/lien-he'] }, { $gt: [{ $strLenCP: { $ifNull: ['$cameFrom', ''] } }, 0] }] },
    { $toLower: '$cameFrom' },
    '$sourcePage',
  ],
};

/** The last 30 days: visits per day (with a small bar chart), the most viewed pages, and the pages that brought requests */
async function getVisitStats(now = new Date()) {
  const days = Array.from({ length: DAYS }, (_, i) => dayOf(new Date(now.getTime() - (DAYS - 1 - i) * DAY_MS)));
  const since = new Date(`${days[0]}T00:00:00+07:00`);
  const [perDay, perPage, brought] = await Promise.all([
    PageView.aggregate([{ $match: { day: { $gte: days[0] } } }, { $group: { _id: '$day', n: { $sum: '$views' } } }]),
    PageView.aggregate([{ $match: { day: { $gte: days[0] } } }, { $group: { _id: '$path', n: { $sum: '$views' } } }, { $sort: { n: -1, _id: 1 } }]),
    QuoteRequest.aggregate([
      { $match: { createdAt: { $gte: since }, sourcePage: { $nin: ['', null] } } },
      { $group: { _id: BROUGHT_BY, n: { $sum: 1 } } },
    ]),
  ]);

  const byDay = new Map(perDay.map((d) => [d._id, d.n]));
  const daily = days.map((day) => ({ day, n: byDay.get(day) || 0 }));
  const total = daily.reduce((sum, d) => sum + d.n, 0);
  // Bar chart, 300 × 64 units: one bar per day
  const top = Math.max(1, ...daily.map((d) => d.n));
  const slot = 300 / DAYS;
  const bars = daily.map((d, i) => {
    const h = d.n ? Math.max(2, round1((d.n / top) * 60)) : 0;
    return { ...d, x: round1(i * slot + 1), w: round1(slot - 2), y: round1(62 - h), h };
  });

  const views = new Map(perPage.map((p) => [p._id, p.n]));
  const most = perPage.length ? perPage[0].n : 1;
  const topPages = perPage.slice(0, 10).map((p) => ({ path: p._id, n: p.n, width: Math.round((p.n / most) * 100) }));
  const requests = brought
    .map((r) => {
      const seen = views.get(r._id) || 0;
      return { path: r._id, requests: r.n, views: seen, per100: seen ? round1((r.n / seen) * 100) : null };
    })
    .sort((a, b) => b.requests - a.requests || b.views - a.views || a.path.localeCompare(b.path))
    .slice(0, 10);

  return { days: DAYS, total, bars, first: days[0], last: days[DAYS - 1], topPages, requests };
}

module.exports = { countPageViews, getVisitStats, shouldCount, cleanPath, dayOf, DAYS };
