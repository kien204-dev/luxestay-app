const { createImageUploadMiddleware } = require("./imageUpload");

const { handleImageUpload: handleLogoUpload } = createImageUploadMiddleware("branding");

module.exports = { handleLogoUpload };
