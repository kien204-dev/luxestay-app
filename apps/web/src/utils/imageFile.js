// The same limits the API applies (apps/api/src/middleware/imageUpload.js),
// checked before uploading so the admin hears about a wrong file at once.
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// Returns an "admin:" translation key describing the problem, or null.
export function imageFileProblem(file) {
  if (!file) return null;
  if (!IMAGE_TYPES.includes(file.type)) return "admin:image.badType";
  if (file.size > MAX_IMAGE_BYTES) return "admin:image.tooLarge";
  return null;
}
