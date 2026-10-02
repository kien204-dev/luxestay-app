const {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE,
  createImageUploadMiddleware,
} = require("./imageUpload");

const { handleImageUpload: handleRoomImageUpload } = createImageUploadMiddleware("rooms");

module.exports = {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE,
  handleRoomImageUpload,
};
