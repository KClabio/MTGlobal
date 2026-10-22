// Lighter pictures: "/assets/x.jpg?w=800" answers with a copy 800 px wide (never larger than the original), as WebP for
// browsers that accept it (all current ones), otherwise JPEG/PNG. Copies are made once with sharp and kept in
// cache/images (not in git; rebuilt by itself when missing). The original file is never changed, and the address
// without ?w= still gives the original. Only the widths below are made, and only for photos inside public/.
// Templates ask for them through picture() (lib/picture.js), which lets the browser pick the size it needs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const WIDTHS = [320, 480, 800, 1200, 1600];
const PUBLIC = path.join(__dirname, '..', 'public');
const RESIZABLE = /^\/(assets|images|uploads\/images)\/.+\.(jpe?g|png)$/i;

function createImages({ cacheDir = path.join(__dirname, '..', 'cache', 'images'), production = process.env.NODE_ENV === 'production' } = {}) {
  const working = new Map(); // copies being made right now (two visitors asking at once share the work)

  async function makeCopy(file, out, width, format) {
    const tmp = `${out}.${process.pid}.${Date.now()}.tmp`;
    let img = sharp(file, { failOn: 'none' }).rotate().resize({ width, withoutEnlargement: true });
    if (format === 'webp') img = img.webp({ quality: 76, effort: 4 });
    else if (format === 'png') img = img.png({ compressionLevel: 9, palette: true });
    else img = img.jpeg({ quality: 78, mozjpeg: true });
    await img.toFile(tmp);
    await fs.promises.rename(tmp, out);
  }

  return async function images(req, res, next) {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || req.query.w === undefined) return next();
    let rel;
    try { rel = decodeURIComponent(req.path); } catch { return next(); }
    if (!RESIZABLE.test(rel) || rel.includes('..') || rel.includes('\0')) return next();
    const width = Number(req.query.w);
    if (!WIDTHS.includes(width)) return next(); // any other width: the original, as without ?w=
    const file = path.join(PUBLIC, rel);
    if (!file.startsWith(PUBLIC + path.sep)) return next();
    let stat;
    try { stat = await fs.promises.stat(file); } catch { return next(); }
    if (!stat.isFile()) return next();

    const webp = /image\/webp/.test(req.get('Accept') || '');
    const format = webp ? 'webp' : /\.png$/i.test(rel) ? 'png' : 'jpeg';
    const key = crypto.createHash('sha1').update(`${rel}|${stat.size}|${stat.mtimeMs}`).digest('hex');
    const out = path.join(cacheDir, `${key}-${width}.${format === 'jpeg' ? 'jpg' : format}`);
    try {
      if (!fs.existsSync(out)) {
        await fs.promises.mkdir(cacheDir, { recursive: true });
        if (!working.has(out)) working.set(out, makeCopy(file, out, width, format).finally(() => working.delete(out)));
        await working.get(out);
      }
    } catch (err) {
      console.error(`Could not make a ${width}px copy of ${rel}: ${err.message}`);
      return next(); // the original is sent instead
    }
    res.set('Vary', 'Accept');
    if (production) res.set('Cache-Control', /^\/uploads\//.test(rel) ? 'public, max-age=31536000, immutable' : 'public, max-age=604800');
    res.type(format);
    res.sendFile(out);
  };
}

module.exports = { createImages, WIDTHS, RESIZABLE };
