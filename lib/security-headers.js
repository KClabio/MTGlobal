// Browser protections sent with every page and file (helmet):
//  - content policy: scripts only from this site (plus its few small inline scripts, each carrying this page's random
//    nonce: <script nonce="<%= cspNonce %>">), styles and fonts only from the site, pictures/videos from the site,
//    Cloudinary and Google profile photos; forms only to this site; no plugins; framing only by this site;
//  - no framing by other sites, no file-type guessing, referrer only as the site's address to other sites
//    (the full address stays within the site: the admin's "back to the same list" reads it), no camera/microphone/…;
//  - production only: HTTPS-only (HSTS) and "upgrade insecure requests" (they would get in the way on http://localhost).
const crypto = require('crypto');
const helmet = require('helmet');

function securityHeaders({ production = process.env.NODE_ENV === 'production', testGoogle = process.env.GOOGLE_OAUTH_TEST_URL } = {}) {
  // The fake Google of the tests serves its profile photos from its own address
  const testPhotos = testGoogle ? [new URL(testGoogle).origin] : [];
  const nonce = (req, res, next) => { res.locals.cspNonce = crypto.randomBytes(16).toString('base64'); next(); };
  const headers = helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https://res.cloudinary.com', 'https://*.googleusercontent.com', ...testPhotos],
        mediaSrc: ["'self'", 'blob:', 'https://res.cloudinary.com'],
        connectSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        ...(production ? { upgradeInsecureRequests: [] } : {}),
      },
    },
    strictTransportSecurity: production ? { maxAge: 31536000, includeSubDomains: true } : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xFrameOptions: { action: 'sameorigin' },
    // Pictures and fonts of this site may still be shown by Google's link previews, mail apps, etc.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
  const permissions = (req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    next();
  };
  return [nonce, headers, permissions];
}

module.exports = { securityHeaders };
