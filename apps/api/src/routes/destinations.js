const express = require("express");
const router = express.Router();

const {
  getDestinationCredits,
  getDestinationsForAdmin,
  uploadDestinationImage,
  updateDestinationCredit,
  deleteDestinationImage,
} = require("../controller/destinationController.js");
const { createImageUploadMiddleware } = require("../middleware/imageUpload");
const { verifyToken, checkRole } = require("../middleware/authMiddleware");
const { uploadRateLimit } = require("../middleware/rateLimit");

const { handleImageUpload: handleDestinationUpload } = createImageUploadMiddleware("destinations");

// Anyone: who took each destination photo and under which licence.
router.get("/credits", getDestinationCredits);

// Admin only: change the photo (and its credit) of a destination.
router.get("/", verifyToken, checkRole("admin"), getDestinationsForAdmin);
router.post("/:name/image", verifyToken, checkRole("admin"), uploadRateLimit, handleDestinationUpload, uploadDestinationImage);
router.put("/:name/credit", verifyToken, checkRole("admin"), updateDestinationCredit);
router.delete("/:name/image", verifyToken, checkRole("admin"), deleteDestinationImage);

module.exports = router;
