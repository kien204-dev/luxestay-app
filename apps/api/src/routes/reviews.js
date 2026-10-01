const express = require("express");
const router = express.Router();

const { listReviews, hideReview } = require("../controller/reviewController.js");
const { verifyToken, checkRole } = require("../middleware/authMiddleware");

// Admin-only: cross-room review moderation list + hide/unhide.
router.get("/", verifyToken, checkRole("admin"), listReviews);
router.patch("/:id/hide", verifyToken, checkRole("admin"), hideReview);

module.exports = router;
