// Form posts must come from this website. A hostile page could otherwise make a visitor's browser send one of our
// forms (a request, a profile change, an admin save) with the visitor's login: "cross-site request forgery".
// The login cookie's SameSite=Lax (server.js) already stops most of it in today's browsers; this is the second check
// OWASP ASVS asks for. Browsers send Origin with every form post (Referer when Origin is missing); a post naming
// another site, or "null" (a sandboxed frame, a data: page), gets a short 403 page. Requests with neither header
// (scripts, the tests' own HTTP client, very old browsers) are let through: a browser on a hostile page always
// sends one of them, so they can't be used for a forged post.
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** 'https://mtg.vn/x' → 'https://mtg.vn'; '' when not a usable address */
function originOf(value) {
  try { return new URL(value).origin; } catch { return ''; }
}

/**
 * "This site": the host name the request came in on, or SITE_URL's when set. The host is compared, not http/https:
 * behind the host's HTTPS proxy without TRUST_PROXY the server would see http while browsers send https, and every
 * form on the live site would be refused.
 */
function isOwnSite(source, req, siteUrl = process.env.SITE_URL) {
  let host;
  try { host = new URL(source).host; } catch { return false; }
  if (host === req.get('host')) return true;
  const fromEnv = siteUrl && originOf(siteUrl);
  return !!fromEnv && host === new URL(fromEnv).host;
}

/** → '' (fine) or the reason it is refused */
function crossSiteReason(req, siteUrl) {
  if (SAFE.has(req.method)) return '';
  const origin = req.get('origin');
  if (origin === 'null') return 'origin null';
  const source = origin ? originOf(origin) : originOf(req.get('referer') || '');
  if (!source) return origin ? 'bad origin' : '';
  return isOwnSite(source, req, siteUrl) ? '' : `from ${source}`;
}

function sameOriginPosts(req, res, next) {
  if (!crossSiteReason(req)) return next();
  res.status(403).render('403', { message: res.locals.t('errors.crossSite') });
}

module.exports = { sameOriginPosts, crossSiteReason, isOwnSite };
