// Style and script addresses with a fingerprint of their content (asset('/js/main.js') -> '/js/main.js?v=3fa9c1d2'),
// so browsers may keep them for a year in production: any edit changes the address.
// The website's styles are also served as one file (/css/site.css; the admin: /css/admin-all.css) instead of six or
// seven separate ones: a phone then waits for one download before it can show text. The source files in public/css
// stay as they are for editing; the joined file is rebuilt when one of them changes.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PUBLIC = path.join(__dirname, '..', 'public');
const SITE_CSS = ['fonts', 'theme', 'base', 'layout', 'components', 'home', 'pages'];
const BUNDLES = { '/css/site.css': SITE_CSS, '/css/admin-all.css': [...SITE_CSS, 'admin'] };
const YEAR = 'public, max-age=31536000, immutable';

const hashOf = (text) => crypto.createHash('sha1').update(text).digest('hex').slice(0, 10);

// Light minifying for production: comments and extra spaces out (the files have no strings that need them)
function minify(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};,>])\s*/g, '$1').replace(/;}/g, '}').trim();
}

// The scripts the pages load, sent minified (terser: comments, spaces and long local names out; about half the size)
// on the live server, and on the test server (ASSETS_MINIFY=1, tests/run.mjs) so every test checks the minified code.
// Names at the top of a file stay as written, so inline page scripts can still call them.
const JS_FILES = ['/js/main.js', '/js/admin.js', '/js/theme.js'];

/** The minified text of a script, or null when terser can't read it (the original is then served) */
async function minifyJs(code) {
  const { minify: terser } = require('terser');
  const result = await terser(code, { compress: true, mangle: true, ecma: 2020 });
  return result.code || null;
}

function createAssets({
  production = process.env.NODE_ENV === 'production',
  minifyScripts = production || process.env.ASSETS_MINIFY === '1',
  minifier = minifyJs,
} = {}) {
  const fileCache = new Map(); // url -> { mtime, hash }
  const bundleCache = new Map(); // url -> { key, text, hash }
  const jsCache = new Map(); // url -> { mtime, hash, text: Promise<string|null> }

  /** { hash, text } of a script: text is the minified code, or null to let express.static send the file */
  function minified(url) {
    const file = path.join(PUBLIC, url);
    const mtime = fs.statSync(file).mtimeMs;
    const cached = jsCache.get(url);
    if (cached && (production || cached.mtime === mtime)) return cached;
    const source = fs.readFileSync(file);
    const entry = { mtime, hash: hashOf(source), text: null };
    entry.text = Promise.resolve()
      .then(() => minifier(source.toString('utf8')))
      .catch((err) => {
        err.message = `Minifying ${url} failed, the original file is sent instead: ${err.message}`;
        require('./error-log').record(err, { where: 'Assets' });
        return null;
      });
    jsCache.set(url, entry);
    return entry;
  }

  /** Serves the minified scripts (when minifying is on); anything else goes on to express.static */
  async function scriptRoute(req, res, next) {
    if (!minifyScripts || !JS_FILES.includes(req.path)) return next();
    let entry;
    try { entry = minified(req.path); } catch { return next(); } // file missing: express.static answers 404
    const text = await entry.text;
    if (text === null) return next();
    res.type('application/javascript');
    res.set('Cache-Control', production && req.query.v === entry.hash ? YEAR : 'no-cache');
    res.set('ETag', `"${entry.hash}-min"`);
    if (req.fresh) return res.status(304).end();
    res.send(text);
  }

  // The live server minifies at start, so the first visitor doesn't wait for it
  if (minifyScripts) for (const url of JS_FILES) { try { minified(url); } catch { /* a missing file is skipped */ } }

  function bundle(url) {
    const names = BUNDLES[url];
    const files = names.map((n) => path.join(PUBLIC, 'css', `${n}.css`));
    const key = files.map((f) => fs.statSync(f).mtimeMs).join('|');
    const cached = bundleCache.get(url);
    if (cached && (production || cached.key === key)) return cached;
    let text = files.map((f, i) => `/* ${names[i]}.css */\n${fs.readFileSync(f, 'utf8')}`).join('\n');
    if (production) text = minify(text);
    const built = { key, text, hash: hashOf(text) };
    bundleCache.set(url, built);
    return built;
  }

  /** '/css/x.css' -> '/css/x.css?v=<fingerprint>' (unknown files are returned unchanged) */
  function asset(url) {
    if (BUNDLES[url]) return `${url}?v=${bundle(url).hash}`;
    const file = path.join(PUBLIC, url);
    if (!file.startsWith(PUBLIC + path.sep)) return url;
    let stat;
    try { stat = fs.statSync(file); } catch { return url; }
    const cached = fileCache.get(url);
    if (cached && (production || cached.mtime === stat.mtimeMs)) return `${url}?v=${cached.hash}`;
    const hash = hashOf(fs.readFileSync(file));
    fileCache.set(url, { mtime: stat.mtimeMs, hash });
    return `${url}?v=${hash}`;
  }

  /** Serves the joined style files */
  function bundleRoute(req, res, next) {
    if (!BUNDLES[req.path]) return next();
    const b = bundle(req.path);
    res.type('text/css');
    res.set('Cache-Control', production && req.query.v === b.hash ? YEAR : 'no-cache');
    res.set('ETag', `"${b.hash}"`);
    if (req.fresh) return res.status(304).end();
    res.send(b.text);
  }

  /** Cache rules for express.static (production only; on a test computer browsers keep checking, so edits show) */
  function staticHeaders(res, filePath) {
    if (!production) return;
    const url = '/' + path.relative(PUBLIC, filePath).split(path.sep).join('/');
    const versioned = res.req && res.req.query && res.req.query.v;
    if (/^\/(css|js|vendor)\//.test(url)) res.set('Cache-Control', versioned ? YEAR : 'public, max-age=3600');
    else if (/^\/uploads\//.test(url)) res.set('Cache-Control', YEAR); // random, never-reused names
    else if (/^\/fonts\//.test(url)) res.set('Cache-Control', 'public, max-age=2592000'); // 30 days
    else if (/^\/(assets|images)\//.test(url)) res.set('Cache-Control', 'public, max-age=604800'); // 7 days
  }

  return { asset, bundleRoute, scriptRoute, staticHeaders, bundle };
}

module.exports = { createAssets, minify, minifyJs, SITE_CSS, BUNDLES, JS_FILES };
