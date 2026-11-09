// One-off, safe to re-run: adds the "Trải nghiệm STEM tại NIC" gallery (lib/solution-pages.js nicGallery) to the saved
// "Workshop trải nghiệm STEM" page, right after its first gallery ("Hình ảnh workshop"), without touching anything else
// the admin wrote. A page not created yet gets the gallery from its defaults when it is first opened.
// Usage: node scripts/add-nic-gallery.js
require('dotenv').config();
const mongoose = require('mongoose');
const { nicGallery, NIC_GALLERY_TITLE } = require('../lib/solution-pages');

async function addNicGallery(db) {
  const pages = db.collection('solutionpages');
  const page = await pages.findOne({ slug: 'workshop' });
  if (!page) return 'workshop: page not created yet (it will start with the NIC gallery)';
  const sections = page.sections || [];
  if (sections.some((s) => s.kind === 'gallery' && s.titleVi === NIC_GALLERY_TITLE)) {
    return 'workshop: the NIC gallery is already there (nothing to do)';
  }
  const firstGallery = sections.findIndex((s) => s.kind === 'gallery');
  const at = firstGallery < 0 ? sections.length : firstGallery + 1;
  await pages.updateOne({ _id: page._id }, { $push: { sections: { $each: [nicGallery()], $position: at } }, $set: { updatedAt: new Date() } });
  return `workshop: added the NIC gallery (6 photos) as block ${at + 1} of ${sections.length + 1}`;
}

module.exports = { addNicGallery };

if (require.main === module) {
  (async () => {
    const connectDB = require('../config/db');
    await connectDB();
    console.log(await addNicGallery(mongoose.connection.db));
    await mongoose.disconnect();
  })().catch((err) => { console.error(err); process.exit(1); });
}
