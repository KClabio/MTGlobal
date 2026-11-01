// Structured data for search engines (schema.org JSON-LD, written into the page head by partials/header.ejs):
//  - Trang chủ: the company (Organization) with its name, logo, address, phone, email and chat links, all from
//    Admin → Thông tin công ty, so Google can show a company card;
//  - every other indexed page: its breadcrumbs ("Trang chủ › Giải pháp › Dự án tham khảo › <project>"), so results
//    show where the page sits. Account and error pages carry none (they are noindex).
// Check after launch with Google's Rich Results Test.
const { chatLinks } = require('./chat-links');
const { absoluteUrl } = require('./seo');

const LEGAL_NAME = 'Công ty TNHH Công nghệ Mễ Trì Global';
const DEFAULT_LOGO = '/images/mtg-logo-transparent.png'; // when Cài đặt chung has no uploaded logo

// The list pages a path can pass through, with their menu label (nav.* in locales)
const SECTIONS = {
  '/giai-phap': 'nav.solutions',
  '/giai-phap/du-an': 'nav.solutionProjects',
  '/giai-phap/thiet-bi': 'nav.solutionEquipment',
  '/san-pham': 'nav.products',
  '/dich-vu': 'nav.services',
  '/tin-tuc': 'nav.news',
};

const withLang = (url, lang) => (lang === 'en' ? `${url}${url.includes('?') ? '&' : '?'}lang=en` : url);

/** The company, from the saved settings (empty fields left out) */
function organization({ base, settings = {}, t }) {
  const contact = settings.contactInfo || {};
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: t('seo.siteName'),
    legalName: LEGAL_NAME,
    alternateName: 'MTG',
    url: `${base}/`,
    logo: absoluteUrl(base, settings.logo || DEFAULT_LOGO),
    description: t('seo.defaultDescription'),
  };
  if (contact.email) org.email = contact.email;
  if (contact.phone) org.telephone = contact.phone;
  if (contact.address) org.address = { '@type': 'PostalAddress', streetAddress: contact.address, addressCountry: 'VN' };
  const same = chatLinks(contact).map((l) => (l.kind === 'messenger' ? l.url.replace(/^https:\/\/m\.me\//, 'https://www.facebook.com/') : l.url));
  if (same.length) org.sameAs = same;
  return org;
}

/** Trang chủ › the section pages on the way › this page (its title without " - MTG") */
function breadcrumbs({ base, path, lang, t, pageTitle }) {
  if (!path || path === '/') return null;
  const items = [{ name: t('nav.home'), url: `${base}/` }];
  const parts = path.split('/').filter(Boolean);
  for (let i = 1; i < parts.length; i++) {
    const p = `/${parts.slice(0, i).join('/')}`;
    if (SECTIONS[p]) items.push({ name: t(SECTIONS[p]), url: base + p });
  }
  const own = String(pageTitle || '').replace(/\s+-\s+MTG$/, '').trim() || (SECTIONS[path] && t(SECTIONS[path])) || '';
  if (!own) return null;
  items.push({ name: own, url: base + path });
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: withLang(it.url, lang) })),
  };
}

/** The JSON-LD blocks for a page ([] when noindex) */
function structuredData({ base, path, lang, t, settings, pageTitle, noindex }) {
  if (noindex || !base) return [];
  if (path === '/') return [organization({ base, settings, t })];
  const crumbs = breadcrumbs({ base, path, lang, t, pageTitle });
  return crumbs ? [crumbs] : [];
}

/** Safe to put inside <script>: no "</script>" or "<!--" can end it early */
const jsonForScript = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

module.exports = { structuredData, organization, breadcrumbs, jsonForScript, SECTIONS };
