const path = require("path");
const {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE,
  createImageUploadMiddleware,
} = require("./imageUpload");

const ROOM_UPLOAD_DIR = path.join(__dirname, "../../uploads/rooms");
const { handleImageUpload: handleRoomImageUpload } =
  createImageUploadMiddleware(ROOM_UPLOAD_DIR);

module.exports = {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE,
  handleRoomImageUpload,
  ROOM_UPLOAD_DIR,
};
