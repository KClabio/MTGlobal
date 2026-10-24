// What a page tells search engines and link previews (Facebook, Zalo, X) in its <head> (views/partials/header.ejs):
// a short description, the canonical address with its other language (the same /path and /path?lang=en pairs as
// the sitemap, lib/sitemap.js) and a 1200 px picture. Addresses are absolute: link previews need the full address.
const { excerpt } = require('./text');
const { resized } = require('./picture');

const DESCRIPTION_MAX = 160; // about what Google shows under a result
const DEFAULT_IMAGE = '/images/og-default.jpg'; // 1200 × 630, the MTG logo on white
const LOCALES = { vi: 'vi_VN', en: 'en_US' };
// Pictures a link preview can show (an SVG or GIF logo can't): the site's photos and Cloudinary uploads
const PREVIEWABLE = /(\.(jpe?g|png|webp)(\?|$))|^https:\/\/res\.cloudinary\.com\//i;

/** '/x' -> 'https://mtg.vn/x'; addresses that are already absolute stay as they are */
function absoluteUrl(base, src) {
  if (!src) return '';
  return /^https?:\/\//i.test(src) ? src : base + (src.startsWith('/') ? '' : '/') + src;
}

/**
 * pageMeta({ base, path, lang, description, fallbackDescription, image, type })
 * -> { description, url, alternates: { vi, en }, image, locale, altLocale, type }
 * description: plain text (pasted HTML is stripped), one line, cut at a word; else fallbackDescription
 * image: the page's picture (when a preview can show it), else DEFAULT_IMAGE, as a 1200 px copy (JPEG for crawlers, lib/images.js)
 */
function pageMeta({ base, path = '/', lang = 'vi', description, fallbackDescription = '', image, type = 'website' }) {
  const vi = base + path;
  const en = `${vi}?lang=en`;
  const own = excerpt(description || '', DESCRIPTION_MAX);
  return {
    description: own || excerpt(fallbackDescription, DESCRIPTION_MAX),
    url: lang === 'en' ? en : vi,
    alternates: { vi, en },
    image: absoluteUrl(base, resized(image && PREVIEWABLE.test(image) ? image : DEFAULT_IMAGE, 1200)),
    locale: LOCALES[lang] || LOCALES.vi,
    altLocale: lang === 'en' ? LOCALES.vi : LOCALES.en,
    type: type === 'article' ? 'article' : 'website',
  };
}

module.exports = { pageMeta, absoluteUrl, DEFAULT_IMAGE, DESCRIPTION_MAX };
