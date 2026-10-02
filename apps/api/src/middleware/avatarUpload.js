const { createImageUploadMiddleware } = require("./imageUpload");

const { handleImageUpload: handleAvatarUpload } = createImageUploadMiddleware("avatars");

module.exports = { handleAvatarUpload };
