// Adds the photos, extra videos and specs of the stair-climbing robot (Robot leo cầu thang) from
// source-assets/robot-leo-cau-thang. Safe to run more than once: files get fixed names and are only added to the
// product when it doesn't list them yet; the specs are only set while the product has none.
// The chat screenshot in that folder is left out on purpose (another company's advert); only its numbers are used.
// Usage: node scripts/add-stair-robot-media.js      (also called from scripts/seed.js)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const SOURCE = path.join(__dirname, '..', 'source-assets', 'robot-leo-cau-thang');

// [source file, name on the site]. Photo order: the back view with the tracks first (product card + link preview)
const PHOTOS = [
  ['1792662074641_1560671419056288099_g6995163351377264344_6ef7b497a48256fc8003c12eb0150254.jpg', 'stair-robot-tracks'],
  ['1792662074654_1560671419056288099_g6995163351377264344_6b0756dafbedb1c1ff18417717f5a1cc.jpg', 'stair-robot-backrest'],
  ['1792662074648_1560671419056288099_g6995163351377264344_9bfd466d6247b0b8c32afd1269912a65.jpg', 'stair-robot-plate'],
];
// After the three demos already on the page: the two upright clips, then the wide one
const VIDEOS = [
  ['1792662074624_1560671419056288099_g6995163351377264344.mp4', 'stair-robot-bricks'],
  ['1792662074631_1560671419056288099_g6995163351377264344.mp4', 'stair-robot-crate'],
  ['1792662074644_1560671419056288099_g6995163351377264344.mp4', 'stair-robot-tracks-closeup'],
];
const SPECS = [
  { key: 'Tải trọng tối đa', value: '200 kg', keyEn: 'Max load', valueEn: '200 kg' },
  { key: 'Công suất động cơ', value: '500 W', keyEn: 'Motor power', valueEn: '500 W' },
  { key: 'Pin', value: '48 V – 12 Ah', keyEn: 'Battery', valueEn: '48 V – 12 Ah' },
];

const useCloudinary = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);

// Upload under a fixed name and return its address; an earlier upload of the same name is reused
async function upload(file, name, subfolder, resourceType) {
  const ext = path.extname(file).toLowerCase();
  if (useCloudinary) {
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });
    const res = await cloudinary.uploader.upload(file, { folder: `mtglobal/${subfolder}`, public_id: name, resource_type: resourceType, overwrite: false });
    return res.secure_url;
  }
  const dir = path.join(__dirname, '..', 'public', 'uploads', subfolder);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, name + ext);
  if (!fs.existsSync(dest)) fs.copyFileSync(file, dest);
  return `/uploads/${subfolder}/${name}${ext}`;
}

// Cloudinary addresses carry a version number, so a file counts as listed when an address ends with its name
const listed = (urls, name) => urls.some((u) => new RegExp(`/${name}\\.[a-z0-9]+$`, 'i').test(u));

async function addStairRobotMedia(Product) {
  const product = await Product.findOne({ category: 'robot-leo-cau-thang' }).sort({ order: 1, _id: 1 });
  if (!product) return ['robot-leo-cau-thang: no product yet (run the seed first)'];
  const log = [];
  const images = [...(product.images || [])];
  const videos = [...(product.videos || [])];
  for (const [list, files, subfolder, type] of [[images, PHOTOS, 'images', 'image'], [videos, VIDEOS, 'videos', 'video']]) {
    for (const [file, name] of files) {
      const src = path.join(SOURCE, file);
      if (listed(list, name)) continue;
      if (!fs.existsSync(src)) { log.push(`missing  ${file}`); continue; }
      list.push(await upload(src, name, subfolder, type));
      log.push(`added    ${name}`);
    }
  }
  const set = {};
  if (images.length !== (product.images || []).length) set.images = images;
  if (videos.length !== (product.videos || []).length) set.videos = videos;
  if (!(product.specs || []).length) { set.specs = SPECS; log.push(`specs    ${SPECS.map((s) => s.keyEn).join(', ')}`); }
  if (!Object.keys(set).length) return ['robot-leo-cau-thang: photos, videos and specs already there (nothing to do)'];
  await Product.updateOne({ _id: product._id }, { $set: set });
  return log;
}

module.exports = { addStairRobotMedia };

if (require.main === module) {
  (async () => {
    const connectDB = require('../config/db');
    await connectDB();
    console.log((await addStairRobotMedia(require('../models/Product'))).join('\n'));
    await mongoose.disconnect();
  })().catch((err) => { console.error(err); process.exit(1); });
}
