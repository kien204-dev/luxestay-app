const { createImageUploadMiddleware } = require("./imageUpload");

// The logo (also kept as PNG, for the PDF) and the home page background.
const { handleImageUpload: handleLogoUpload } = createImageUploadMiddleware("logo");
const { handleImageUpload: handleHeroUpload } = createImageUploadMiddleware("hero");

module.exports = { handleLogoUpload, handleHeroUpload };
