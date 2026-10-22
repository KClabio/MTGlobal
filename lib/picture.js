// <img> with sizes for every screen: picture(src, alt, { sizes, eager, cls, width }).
// The browser picks the smallest copy that is still sharp on that screen (lib/images.js makes them for the site's
// own photos; a Cloudinary photo gets Cloudinary's own resizing in its address). Pictures load lazily, except the
// first one of a page (eager: true), which is needed straight away. Anything else (an icon, an SVG, a GIF) is left
// as a plain <img>.
const { escapeHtml } = require('./text');
const { WIDTHS, RESIZABLE } = require('./images');

const SRCSET_WIDTHS = [480, 800, 1200, 1600];
const CLOUDINARY = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;

/** One picture address at a given width ('' when there is no picture) */
function resized(src, width) {
  if (!src) return '';
  const w = WIDTHS.includes(width) ? width : 800;
  const cloud = CLOUDINARY.exec(src);
  if (cloud) return `${cloud[1]}f_auto,q_auto,c_limit,w_${w}/${cloud[2]}`;
  const local = src.split('?')[0];
  if (RESIZABLE.test(local)) return `${local}?w=${w}`;
  return src;
}

function picture(src, alt, opts = {}) {
  if (!src) return '';
  const { sizes = '(max-width: 640px) 100vw, 400px', eager = false, cls = '', width = 800, attrs = '' } = opts;
  const canResize = CLOUDINARY.test(src) || RESIZABLE.test(src.split('?')[0]);
  const parts = [`src="${escapeHtml(resized(src, width))}"`];
  if (canResize) {
    parts.push(`srcset="${escapeHtml(SRCSET_WIDTHS.map((w) => `${resized(src, w)} ${w}w`).join(', '))}"`);
    parts.push(`sizes="${escapeHtml(sizes)}"`);
  }
  parts.push(`alt="${escapeHtml(alt || '')}"`);
  if (cls) parts.push(`class="${escapeHtml(cls)}"`);
  parts.push(eager ? 'fetchpriority="high"' : 'loading="lazy"');
  parts.push('decoding="async"');
  return `<img ${parts.join(' ')}${attrs ? ' ' + attrs : ''}>`;
}

module.exports = { picture, resized, SRCSET_WIDTHS };
