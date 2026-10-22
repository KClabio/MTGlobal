// For search engines: /robots.txt (stay out of the admin and account pages; where the sitemap is) and /sitemap.xml
// (every public page, read from the database, in Vietnamese and English: /path and /path?lang=en, each pointing to
// the other with hreflang so Google shows the right language). The site's address comes from SITE_URL when set
// (e.g. https://mtg.vn), otherwise from the visit itself (correct behind the host's HTTPS once TRUST_PROXY is set).
const { escapeHtml } = require('./text');

const DISALLOW = ['/admin', '/tai-khoan', '/ho-so', '/dang-xuat', '/dang-nhap/google'];
const CACHE_MS = 10 * 60 * 1000; // live server only: new content shows within 10 minutes

/** https://example.com (no trailing slash) */
function siteBase(req, siteUrl = process.env.SITE_URL) {
  const set = String(siteUrl || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\/[^/\s]+/i.test(set)) return set;
  return `${req.protocol}://${req.get('host')}`;
}

function robotsText(base) {
  return ['User-agent: *', ...DISALLOW.map((p) => `Disallow: ${p}`), '', `Sitemap: ${base}/sitemap.xml`, ''].join('\n');
}

const day = (d) => (d instanceof Date && !isNaN(d) ? d.toISOString().slice(0, 10) : null);

/** entries: [{ path: '/giai-phap', lastmod?: Date }] → the sitemap, each page in both languages */
function buildSitemap(base, entries) {
  const urls = [];
  for (const { path, lastmod } of entries) {
    const vi = escapeHtml(base + path);
    const en = escapeHtml(`${base}${path}${path.includes('?') ? '&' : '?'}lang=en`);
    const links = `<xhtml:link rel="alternate" hreflang="vi" href="${vi}"/><xhtml:link rel="alternate" hreflang="en" href="${en}"/><xhtml:link rel="alternate" hreflang="x-default" href="${vi}"/>`;
    const mod = day(lastmod) ? `<lastmod>${day(lastmod)}</lastmod>` : '';
    for (const loc of [vi, en]) urls.push(`<url><loc>${loc}</loc>${mod}${links}</url>`);
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
    + urls.join('\n') + '\n</urlset>\n';
}

/** Every public page (not Liên hệ: it sends logged-out visitors to the login page) */
async function collectEntries() {
  const Product = require('../models/Product');
  const Project = require('../models/Project');
  const Service = require('../models/Service');
  const Article = require('../models/Article');
  const Partner = require('../models/Partner');
  const { SLUGS: SOLUTION_SLUGS } = require('./solution-pages');
  const ROBOTS = Product.PRODUCT_CATEGORIES.filter((c) => c !== 'stem-equipment');
  const [robots, equipment, projects, services, articles, partners] = await Promise.all([
    Product.find({ category: { $in: ROBOTS } }).select('category updatedAt').lean(),
    Product.find({ category: 'stem-equipment' }).sort({ order: 1, _id: 1 }).select('updatedAt').lean(),
    Project.find().sort({ order: 1, createdAt: -1 }).select('updatedAt').lean(),
    Service.find().sort({ order: 1, _id: 1 }).select('slug updatedAt').lean(),
    Article.find({ published: true }).sort({ order: 1, createdAt: -1 }).select('updatedAt').lean(),
    Partner.find({ slug: { $nin: [null, ''] } }).sort({ order: 1, _id: 1 }).select('slug updatedAt').lean(),
  ]);
  const fixed = ['/', '/ve-mtg', '/san-pham', '/giai-phap', '/giai-phap/thiet-bi', '/giai-phap/du-an',
    ...SOLUTION_SLUGS.map((s) => `/giai-phap/${s}`), '/dich-vu', '/tin-tuc', '/chinh-sach-bao-mat'].map((path) => ({ path }));
  const seenRobots = new Set();
  return [
    ...fixed,
    ...robots.filter((r) => !seenRobots.has(r.category) && seenRobots.add(r.category)).map((r) => ({ path: `/san-pham/${r.category}`, lastmod: r.updatedAt })),
    ...equipment.map((e) => ({ path: `/giai-phap/thiet-bi/${e._id}`, lastmod: e.updatedAt })),
    ...projects.map((p) => ({ path: `/giai-phap/du-an/${p._id}`, lastmod: p.updatedAt })),
    ...services.map((s) => ({ path: `/dich-vu/${encodeURIComponent(s.slug)}`, lastmod: s.updatedAt })),
    ...articles.map((a) => ({ path: `/tin-tuc/${a._id}`, lastmod: a.updatedAt })),
    ...partners.map((p) => ({ path: `/doi-tac/${encodeURIComponent(p.slug)}`, lastmod: p.updatedAt })),
  ];
}

function robotsRoute(req, res) {
  res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(robotsText(siteBase(req)));
}

function createSitemapRoute({ production = process.env.NODE_ENV === 'production' } = {}) {
  const cache = new Map(); // base → { at, xml }
  return async function sitemapRoute(req, res, next) {
    try {
      const base = siteBase(req);
      const hit = cache.get(base);
      let xml = production && hit && Date.now() - hit.at < CACHE_MS ? hit.xml : null;
      if (!xml) {
        xml = buildSitemap(base, await collectEntries());
        cache.set(base, { at: Date.now(), xml });
      }
      res.type('application/xml').set('Cache-Control', production ? 'public, max-age=600' : 'no-cache').send(xml);
    } catch (err) { next(err); }
  };
}

module.exports = { siteBase, robotsText, buildSitemap, collectEntries, robotsRoute, createSitemapRoute, DISALLOW };
