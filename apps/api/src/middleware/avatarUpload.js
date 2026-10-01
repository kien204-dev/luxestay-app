const path = require("path");
const { createImageUploadMiddleware } = require("./imageUpload");

const AVATAR_UPLOAD_DIR = path.join(__dirname, "../../uploads/avatars");
const { handleImageUpload: handleAvatarUpload } =
  createImageUploadMiddleware(AVATAR_UPLOAD_DIR);

module.exports = {
  handleAvatarUpload,
  AVATAR_UPLOAD_DIR,
};
