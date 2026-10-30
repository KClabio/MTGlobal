#!/usr/bin/env node
// Makes the browser tab icon from the logo (public/images/mtg-logo-transparent.png): the "MTG" letters without the
// tagline, centred on a white rounded square so they also show on dark tab bars. Run again after a new logo:
//   node scripts/make-icons.js
// Writes public/images/icon-32.png (tab), public/images/icon-180.png (iPhone home screen) and public/favicon.ico
// (the 32 px PNG inside an ICO wrapper, for browsers that ask for /favicon.ico by themselves).
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const PUBLIC = path.join(__dirname, '..', 'public');
const LOGO = path.join(PUBLIC, 'images', 'mtg-logo-transparent.png');
const LETTERS_HEIGHT = 0.74; // the top 74 % of the logo holds the letters; the tagline sits below

async function icon(size) {
  const meta = await sharp(LOGO).metadata();
  // Two steps: in one chain sharp would trim before cropping
  const top = await sharp(LOGO).extract({ left: 0, top: 0, width: meta.width, height: Math.round(meta.height * LETTERS_HEIGHT) }).toBuffer();
  const letters = await sharp(top).trim().toBuffer();
  const inner = Math.round(size * 0.94);
  const mark = await sharp(letters).resize({ width: inner, height: inner, fit: 'inside' }).toBuffer();
  const radius = Math.round(size * 0.2);
  const tile = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`);
  return sharp(tile).composite([{ input: mark, gravity: 'center' }]).png().toBuffer();
}

/** A one-picture .ico holding a PNG (allowed since Windows Vista; every current browser reads it) */
function ico(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(1, 4); // one picture
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size, 0);
  entry.writeUInt8(size, 1);
  entry.writeUInt8(0, 2); // no palette
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);
  return Buffer.concat([header, entry, png]);
}

(async () => {
  const small = await icon(32);
  fs.writeFileSync(path.join(PUBLIC, 'images', 'icon-32.png'), small);
  fs.writeFileSync(path.join(PUBLIC, 'images', 'icon-180.png'), await icon(180));
  fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), ico(small, 32));
  console.log('Written: public/images/icon-32.png, public/images/icon-180.png, public/favicon.ico');
})().catch((err) => { console.error(err); process.exit(1); });
