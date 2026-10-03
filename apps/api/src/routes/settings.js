const express = require("express");
const router = express.Router();

const {
  getPublicSettings,
  getAdminSettings,
  updateSettings,
  uploadLogo,
  deleteLogo,
  uploadHero,
  deleteHero,
} = require("../controller/settingsController.js");
const { handleLogoUpload, handleHeroUpload } = require("../middleware/brandingUpload.js");
const { verifyToken, checkRole } = require("../middleware/authMiddleware");
const { uploadRateLimit } = require("../middleware/rateLimit");

// Anyone: the name, logo, home page background and contact details the site
// itself displays.
router.get("/public", getPublicSettings);

// Admin only: the full form, including which values are stored and which
// are falling back to the environment.
router.get("/", verifyToken, checkRole("admin"), getAdminSettings);
router.put("/", verifyToken, checkRole("admin"), updateSettings);
router.post("/logo", verifyToken, checkRole("admin"), uploadRateLimit, handleLogoUpload, uploadLogo);
router.delete("/logo", verifyToken, checkRole("admin"), deleteLogo);
router.post("/hero", verifyToken, checkRole("admin"), uploadRateLimit, handleHeroUpload, uploadHero);
router.delete("/hero", verifyToken, checkRole("admin"), deleteHero);

module.exports = router;
