const { publicUrl } = require("../services/storage");
const { apiMessage } = require("../utils/apiMessages");

// The image itself was verified and stored by the upload middleware; these
// just tell the client where it now lives.
exports.uploadRoomImage = (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      ...apiMessage("NO_IMAGE_UPLOADED"),
    });
  }

  res.status(201).json({
    ...apiMessage("ROOM_IMAGE_UPLOADED"),
    image: publicUrl(req, req.file.storedPath),
  });
};

exports.uploadAvatar = (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      ...apiMessage("NO_IMAGE_UPLOADED"),
    });
  }

  res.status(201).json({
    ...apiMessage("AVATAR_UPLOADED"),
    avatarUrl: publicUrl(req, req.file.storedPath),
  });
};
