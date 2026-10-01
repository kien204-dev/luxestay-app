const express = require("express");
const router = express.Router();

const {
  getPublicSettings,
  getAdminSettings,
  updateSettings,
  uploadLogo,
  deleteLogo,
} = require("../controller/settingsController.js");
const { handleLogoUpload } = require("../middleware/brandingUpload.js");
const { verifyToken, checkRole } = require("../middleware/authMiddleware");
const { uploadRateLimit } = require("../middleware/rateLimit");

// Anyone: the name, logo and contact details the site itself displays.
router.get("/public", getPublicSettings);

// Admin only: the full form, including which values are stored and which
// are falling back to the environment.
router.get("/", verifyToken, checkRole("admin"), getAdminSettings);
router.put("/", verifyToken, checkRole("admin"), updateSettings);
router.post("/logo", verifyToken, checkRole("admin"), uploadRateLimit, handleLogoUpload, uploadLogo);
router.delete("/logo", verifyToken, checkRole("admin"), deleteLogo);

module.exports = router;
