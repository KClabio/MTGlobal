const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

const useCloudinary = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

let cloudinary = null;
if (useCloudinary) {
  cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg'];

const FIELD_CONFIG = {
  image: { subfolder: 'images', resourceType: 'image', extensions: IMAGE_EXTENSIONS },
  images: { subfolder: 'images', resourceType: 'image', extensions: IMAGE_EXTENSIONS },
  logo: { subfolder: 'images', resourceType: 'image', extensions: IMAGE_EXTENSIONS },
  coverImage: { subfolder: 'images', resourceType: 'image', extensions: IMAGE_EXTENSIONS },
  heroImage: { subfolder: 'images', resourceType: 'image', extensions: IMAGE_EXTENSIONS },
  gallery: { subfolder: 'images', resourceType: 'image', extensions: IMAGE_EXTENSIONS },
  heroHome: { subfolder: 'images', resourceType: 'image', extensions: IMAGE_EXTENSIONS },
  heroProducts: { subfolder: 'images', resourceType: 'image', extensions: IMAGE_EXTENSIONS },
  heroSolution: { subfolder: 'images', resourceType: 'image', extensions: IMAGE_EXTENSIONS },
  heroServices: { subfolder: 'images', resourceType: 'image', extensions: IMAGE_EXTENSIONS },
  avatar: { subfolder: 'images', resourceType: 'image', extensions: IMAGE_EXTENSIONS },
  videos: { subfolder: 'videos', resourceType: 'video', extensions: VIDEO_EXTENSIONS },
};

// Editable solution pages post their new files as "media__<section uid>": images or videos in one field
const PAGE_MEDIA_PREFIX = 'media__';
function configFor(file) {
  if (file.fieldname.startsWith(PAGE_MEDIA_PREFIX)) {
    const isVideo = VIDEO_EXTENSIONS.includes(path.extname(file.originalname).toLowerCase());
    return isVideo ? FIELD_CONFIG.videos : { ...FIELD_CONFIG.images, extensions: [...IMAGE_EXTENSIONS, ...VIDEO_EXTENSIONS] };
  }
  if (file.fieldname.startsWith('banner_')) return FIELD_CONFIG.images; // page banner backgrounds (Cài đặt chung)
  return FIELD_CONFIG[file.fieldname];
}

function makeStorage() {
  if (useCloudinary) {
    return require('../lib/cloudinary-storage').cloudinaryStorage({
      uploader: cloudinary.uploader,
      params: (req, file) => {
        const config = configFor(file) || FIELD_CONFIG.image;
        return {
          folder: `mtglobal/${config.subfolder}`,
          resource_type: config.resourceType,
          public_id: crypto.randomUUID(),
        };
      },
    });
  }
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const config = configFor(file) || FIELD_CONFIG.image;
      cb(null, path.join(__dirname, '..', 'public', 'uploads', config.subfolder));
    },
    filename: (req, file, cb) => {
      cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase());
    },
  });
}

function fileFilter(req, file, cb) {
  const config = configFor(file);
  const ext = path.extname(file.originalname).toLowerCase();
  if (!config) return cb(new Error(`Trường file không hợp lệ: ${file.fieldname}`));
  if (!config.extensions.includes(ext)) {
    return cb(new Error(`Định dạng file không được hỗ trợ: ${ext}`));
  }
  cb(null, true);
}

// Returns the URL to store in the DB regardless of storage backend.
function fileUrl(file) {
  if (!file) return null;
  if (useCloudinary) return file.path;
  const config = configFor(file) || FIELD_CONFIG.image;
  return `/uploads/${config.subfolder}/${file.filename}`;
}

function fileUrls(files) {
  return (files || []).map(fileUrl);
}

const upload = multer({
  storage: makeStorage(),
  limits: { fileSize: useCloudinary ? 100 * 1024 * 1024 : 300 * 1024 * 1024 },
  fileFilter,
});

// Single image field (logo / cover / hero).
const uploadSingleImage = (fieldName) => upload.single(fieldName);

// Project/Product form: multiple images + multiple videos in one submit.
const uploadMedia = upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'videos', maxCount: 5 },
]);

// Service form: one hero image + a photo gallery.
const uploadServiceMedia = upload.fields([
  { name: 'heroImage', maxCount: 1 },
  { name: 'gallery', maxCount: 12 },
]);

// Solution page editor: any number of "media__<section uid>" fields (images and videos), at most 30 files per save
const uploadPageMedia = multer({
  storage: makeStorage(),
  limits: { fileSize: useCloudinary ? 100 * 1024 * 1024 : 300 * 1024 * 1024, files: 30 },
  fileFilter,
}).any();

// General settings form (Cài đặt chung): logo, home hero image, and one background image per page banner.
const uploadSettingsImages = upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'heroHome', maxCount: 1 },
  ...require('../lib/banners').BANNER_KEYS.map((key) => ({ name: `banner_${key}`, maxCount: 1 })),
]);

// User avatar: its own small size limit, and the file must actually be an image (not just named like one).
const AVATAR_MAX_BYTES = 20 * 1024 * 1024;
const uploadAvatar = multer({
  storage: makeStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) return cb(new Error('INVALID_AVATAR_TYPE'));
    fileFilter(req, file, cb);
  },
}).single('avatar');

// Checks a locally stored upload's leading bytes (the declared mimetype comes from the client and
// can't be trusted). Cloudinary uploads are validated by Cloudinary itself.
async function isRealImageFile(file) {
  if (useCloudinary || !file || !file.path) return true;
  const fs = require('fs');
  let handle;
  try {
    handle = await fs.promises.open(file.path, 'r');
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(12), 0, 12, 0);
    if (bytesRead < 12) return false;
    const ascii = (start, end) => buffer.toString('ascii', start, end);
    return (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) // JPEG
      || buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) // PNG
      || ascii(0, 4) === 'GIF8' // GIF
      || (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'); // WEBP
  } catch (err) {
    return false;
  } finally {
    if (handle) await handle.close();
  }
}

// Deletes a locally stored image by its public URL; Cloudinary assets are left alone.
// Uploaded image or video (solution pages); shipped files under /assets are never touched
function removeLocalMedia(url) {
  if (useCloudinary || !url) return;
  const match = /^\/uploads\/(images|videos)\/([^/]+)$/.exec(url);
  if (!match) return;
  require('fs').promises.unlink(path.join(__dirname, '..', 'public', 'uploads', match[1], path.basename(match[2]))).catch(() => {});
}

function removeLocalUpload(url) {
  if (useCloudinary || !url || !url.startsWith('/uploads/images/')) return;
  const file = path.join(__dirname, '..', 'public', 'uploads', 'images', path.basename(url));
  require('fs').promises.unlink(file).catch(() => {});
}

// A personal photo (avatar) is deleted wherever it is stored: the local file, or the copy on Cloudinary.
// Google photos and other addresses are left alone; a Cloudinary error is only logged.
function removeUpload(url) {
  if (!useCloudinary) return removeLocalUpload(url);
  const asset = require('../lib/cloudinary-storage').cloudinaryPublicId(url, process.env.CLOUDINARY_CLOUD_NAME);
  if (!asset) return;
  cloudinary.uploader.destroy(asset.publicId, { resource_type: asset.resourceType })
    .catch((err) => console.error('Cloudinary delete failed:', asset.publicId, err.message));
}

function friendlyUploadError(err) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return 'File quá dung lượng cho phép.';
  }
  return err ? err.message : 'Đã có lỗi xảy ra khi tải file lên.';
}

// Multer's callback-based error handling doesn't propagate through Express's
// async route wrapping, so route handlers need an explicit err check via this helper.
function wrapUpload(uploader, handler) {
  return (req, res, next) => {
    uploader(req, res, (err) => {
      if (err) {
        req.uploadError = friendlyUploadError(err);
        req.uploadErrorCode = err.code || err.message;
      }
      Promise.resolve(handler(req, res, next)).catch(next);
    });
  };
}

module.exports = {
  useCloudinary,
  uploadSingleImage,
  uploadMedia,
  uploadServiceMedia,
  uploadPageMedia,
  removeLocalMedia,
  PAGE_MEDIA_PREFIX,
  uploadSettingsImages,
  uploadAvatar,
  AVATAR_MAX_BYTES,
  isRealImageFile,
  removeLocalUpload,
  removeUpload,
  fileUrl,
  fileUrls,
  friendlyUploadError,
  wrapUpload,
};
