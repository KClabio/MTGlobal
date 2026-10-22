// Multer storage that streams each upload to Cloudinary (used by middleware/upload.js when Cloudinary is set up).
// Replaces the multer-storage-cloudinary package, which only works with the old cloudinary 1.x (known flaw).
// Like it, the stored file gets path = the picture's https address, filename = Cloudinary's id, size = bytes.
// uploader: cloudinary.v2.uploader (a stand-in in the unit tests); params(req, file) -> upload options.
function cloudinaryStorage({ uploader, params }) {
  return {
    _handleFile(req, file, cb) {
      let options;
      try { options = params(req, file); } catch (err) { return cb(err); }
      const upload = uploader.upload_stream(options, (err, result) => {
        if (err) return cb(err);
        cb(null, { path: result.secure_url, filename: result.public_id, size: result.bytes, resourceType: result.resource_type });
      });
      file.stream.on('error', cb);
      file.stream.pipe(upload);
    },
    // A rejected upload (wrong type, too large…) is deleted from Cloudinary again
    _removeFile(req, file, cb) {
      if (!file.filename) return cb(null);
      uploader.destroy(file.filename, { resource_type: file.resourceType || 'image' }, (err) => cb(err || null));
    },
  };
}

module.exports = { cloudinaryStorage };
