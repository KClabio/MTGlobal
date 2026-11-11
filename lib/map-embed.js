// The maps on Liên hệ and Về MTG. Admin → Thông tin công ty → "Bản đồ": the staff paste either Google Maps' "Embed a map" code
// (<iframe src="https://www.google.com/maps/embed?pb=…" …>) or just its address. Only a Google Maps embed address is
// kept, so the page never frames another website (the content policy allows frames from www.google.com only,
// lib/security-headers.js).

const MAX_LENGTH = 2000;

/** The usable embed address in what was pasted, '' when there is none (empty input, another site, a normal map link) */
function cleanMapEmbed(input) {
  let text = String(input == null ? '' : input).trim();
  if (!text || text.length > MAX_LENGTH * 2) return '';
  // The whole <iframe …> code: take its src
  const src = text.match(/<iframe\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1/i);
  if (src) text = src[2];
  else if (/</.test(text)) return '';
  text = text.replace(/&amp;/g, '&').trim();
  let url;
  try { url = new URL(text); } catch { return ''; }
  if (url.protocol !== 'https:' || url.hostname !== 'www.google.com' || !url.pathname.startsWith('/maps/embed')) return '';
  if (url.username || url.password || url.port) return '';
  return url.href.length <= MAX_LENGTH ? url.href : '';
}

// Về MTG always shows a map when the company address is set: the pasted embed above if there is one, else Google's
// own map of the address (www.google.com/maps?…&output=embed, no account or key needed; the same site the content
// policy already allows). Only the address is sent to Google, in the map's address.
const GOOGLE_MAPS = 'https://www.google.com/maps';
const addressQuery = (address) => String(address == null ? '' : address).replace(/\s+/g, ' ').trim().slice(0, 300);

/** A Google map of a written address, '' without an address */
function addressMapEmbed(address, lang = 'vi') {
  const q = addressQuery(address);
  return q ? `${GOOGLE_MAPS}?q=${encodeURIComponent(q)}&hl=${lang === 'en' ? 'en' : 'vi'}&z=17&output=embed` : '';
}

/** Google Maps opened on the address (in a new tab; the Maps app on phones), '' without an address */
function directionsUrl(address) {
  const q = addressQuery(address);
  return q ? `${GOOGLE_MAPS}/search/?api=1&query=${encodeURIComponent(q)}` : '';
}

/** The map for a page: the pasted Google embed when there is one, else the map of the address, else '' */
function mapFor(contact, lang) {
  const c = contact || {};
  return cleanMapEmbed(c.mapEmbedUrl) || addressMapEmbed(c.address, lang);
}

module.exports = { cleanMapEmbed, addressMapEmbed, directionsUrl, mapFor };
