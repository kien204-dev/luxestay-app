const crypto = require("crypto");
const multer = require("multer");
const sharp = require("sharp");
const { storeUpload } = require("../services/storage");
const { apiMessage } = require("../utils/apiMessages");

// Phone photos are often 3–8 MB; anything up to this is accepted and then
// shrunk to what the site actually shows.
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

// How each kind of upload is stored. Every image is turned upright from its
// EXIF orientation, stripped of all metadata (EXIF, GPS, camera data),
// shrunk to fit the box (never enlarged) and saved as WebP. The logo also
// gets a PNG copy next to it, for the PDF confirmation (pdfkit cannot embed
// WebP).
const PRESETS = {
  rooms: { folder: "rooms", width: 2000, height: 2000, fit: "inside", quality: 80 },
  avatars: { folder: "avatars", width: 512, height: 512, fit: "cover", quality: 82 },
  logo: { folder: "branding", width: 512, height: 512, fit: "inside", quality: 90, pngCopy: true },
  hero: { folder: "branding", width: 2400, height: 1600, fit: "inside", quality: 78 },
  destinations: { folder: "destinations", width: 2000, height: 1500, fit: "inside", quality: 80 },
};

// The PNG copy of a stored logo: same name, .png instead of .webp.
function pngCopyOf(reference) {
  return typeof reference === "string" && /\.webp$/i.test(reference) ? reference.replace(/\.webp$/i, ".png") : null;
}

// Re-encodes one uploaded image. Exported for the tests.
async function processImage(buffer, preset) {
  const base = sharp(buffer, { failOn: "error" })
    .rotate()
    .resize({ width: preset.width, height: preset.height, fit: preset.fit, withoutEnlargement: true });

  const webp = await base.clone().webp({ quality: preset.quality, effort: 4 }).toBuffer();
  const png = preset.pngCopy ? await base.clone().png({ compressionLevel: 9 }).toBuffer() : null;
  return { webp, png };
}

// Shared upload pipeline for every image field: buffer the upload in memory,
// verify the real file content by magic bytes (not just the declared
// mimetype), re-encode it (see PRESETS), then hand it to the storage service
// (local disk or an S3-compatible bucket). Callers pick a preset name.
function createImageUploadMiddleware(presetName) {
  const preset = PRESETS[presetName];
  if (!preset) throw new Error(`Unknown image preset: ${presetName}`);

  const uploadToMemory = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_SIZE, files: 1 },
  });

  async function persistVerifiedImage(req) {
    const { fileTypeFromBuffer } = await import("file-type");
    const detected = await fileTypeFromBuffer(req.file.buffer);

    if (!detected || !ALLOWED_IMAGE_TYPES.has(detected.mime)) {
      const error = new Error("File content must be a valid jpg, png, or webp image");
      error.code = "INVALID_IMAGE_CONTENT";
      throw error;
    }

    let processed;
    try {
      processed = await processImage(req.file.buffer, preset);
    } catch (err) {
      const error = new Error(`Image could not be read: ${err.message}`);
      error.code = "INVALID_IMAGE_CONTENT";
      throw error;
    }

    const name = crypto.randomUUID();
    req.file.filename = `${name}.webp`;
    req.file.mimetype = "image/webp";
    // What to store in the database for this image: "/uploads/<folder>/<file>"
    // on local disk, or the object's public URL on S3.
    req.file.storedPath = await storeUpload(preset.folder, req.file.filename, processed.webp, "image/webp");
    if (processed.png) await storeUpload(preset.folder, `${name}.png`, processed.png, "image/png");
    delete req.file.buffer;
  }

  function handleImageUpload(req, res, next) {
    uploadToMemory.single("image")(req, res, async (err) => {
      if (err) {
        return res
          .status(400)
          .json(err.code === "LIMIT_FILE_SIZE" ? apiMessage("IMAGE_TOO_LARGE", { maxMb: 10 }) : apiMessage("IMAGE_UPLOAD_FAILED"));
      }

      if (!req.file) {
        return res.status(400).json(apiMessage("NO_IMAGE_UPLOADED"));
      }

      try {
        await persistVerifiedImage(req);
        return next();
      } catch (validationError) {
        console.warn("IMAGE UPLOAD REJECTED:", validationError.message);
        return res
          .status(400)
          .json(apiMessage(validationError.code === "INVALID_IMAGE_CONTENT" ? "INVALID_IMAGE" : "IMAGE_UPLOAD_FAILED"));
      }
    });
  }

  return { handleImageUpload };
}

module.exports = {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE,
  PRESETS,
  createImageUploadMiddleware,
  pngCopyOf,
  processImage,
};
