const crypto = require("crypto");
const multer = require("multer");
const { storeUpload } = require("../services/storage");

const MAX_IMAGE_SIZE = 2 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

// Shared upload pipeline for any image field (room photos, user avatars, the
// logo): buffer the upload in memory, verify the real file content by magic
// bytes (not just the declared mimetype), then hand it to the storage
// service (local disk or an S3-compatible bucket). Callers only pick the
// folder ("rooms", "avatars", "branding").
function createImageUploadMiddleware(folder) {

  const uploadToMemory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
  });

  async function persistVerifiedImage(req) {
    const { fileTypeFromBuffer } = await import("file-type");
    const detected = await fileTypeFromBuffer(req.file.buffer);
    const extension = detected && ALLOWED_IMAGE_TYPES.get(detected.mime);

    if (!extension) {
      const error = new Error("File content must be a valid jpg, png, or webp image");
      error.code = "INVALID_IMAGE_CONTENT";
      throw error;
    }

    const filename = `${crypto.randomUUID()}.${extension}`;

    req.file.filename = filename;
    req.file.mimetype = detected.mime;
    // What to store in the database for this image: "/uploads/<folder>/<file>"
    // on local disk, or the object's public URL on S3.
    req.file.storedPath = await storeUpload(folder, filename, req.file.buffer, detected.mime);
    delete req.file.buffer;
  }

  function handleImageUpload(req, res, next) {
    uploadToMemory.single("image")(req, res, async (err) => {
      if (err) {
        const message = err.code === "LIMIT_FILE_SIZE"
          ? "Image size must be 2MB or smaller"
          : "Image upload failed";
        return res.status(400).json({ message });
      }

      if (!req.file) {
        return res.status(400).json({ message: "No image file uploaded" });
      }

      try {
        await persistVerifiedImage(req);
        return next();
      } catch (validationError) {
        console.warn("IMAGE UPLOAD REJECTED:", validationError.message);
        return res.status(400).json({
          message: validationError.code === "INVALID_IMAGE_CONTENT"
            ? validationError.message
            : "Image upload failed",
        });
      }
    });
  }

  return { handleImageUpload };
}

module.exports = {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE,
  createImageUploadMiddleware,
};
