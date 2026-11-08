// The map on Liên hệ (Admin → Thông tin công ty → "Bản đồ"): the staff paste either Google Maps' "Embed a map" code
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

module.exports = { cleanMapEmbed };
