const fs = require("fs");
const path = require("path");

// Best-effort cleanup of a locally-hosted upload (room image, avatar, ...).
// Never throws — failures are logged with enough context to debug a
// leftover file later, but must not fail the caller's request.
function deleteLocalUploadFile(imageValue, uploadDir, marker, context = {}) {
  if (!imageValue || typeof imageValue !== "string") return;

  const markerIndex = imageValue.indexOf(marker);
  if (markerIndex === -1) return;

  const filename = imageValue.slice(markerIndex + marker.length).split(/[?#]/)[0];
  if (!filename || filename.includes("..") || filename.includes("/")) return;

  const filePath = path.join(uploadDir, filename);
  fs.promises.unlink(filePath).catch((err) => {
    console.error("LOCAL UPLOAD CLEANUP FAILED:", {
      ...context,
      filePath,
      error: err.message,
    });
  });
}

module.exports = { deleteLocalUploadFile };
