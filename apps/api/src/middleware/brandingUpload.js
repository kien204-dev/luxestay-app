const path = require("path");
const { createImageUploadMiddleware } = require("./imageUpload");

const BRANDING_UPLOAD_DIR = path.join(__dirname, "../../uploads/branding");
const { handleImageUpload: handleLogoUpload } = createImageUploadMiddleware(BRANDING_UPLOAD_DIR);

module.exports = { BRANDING_UPLOAD_DIR, handleLogoUpload };
