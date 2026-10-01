const { publicUrl } = require("../services/storage");

// The image itself was verified and stored by the upload middleware; these
// just tell the client where it now lives.
exports.uploadRoomImage = (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      message: "No image file uploaded",
    });
  }

  res.status(201).json({
    message: "Room image uploaded successfully",
    image: publicUrl(req, req.file.storedPath),
  });
};

exports.uploadAvatar = (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      message: "No image file uploaded",
    });
  }

  res.status(201).json({
    message: "Avatar uploaded successfully",
    avatarUrl: publicUrl(req, req.file.storedPath),
  });
};
