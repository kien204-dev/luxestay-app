const express = require("express");
const router = express.Router();

const { getFeaturedReviews, listReviews, hideReview } = require("../controller/reviewController.js");
const { verifyToken, checkRole } = require("../middleware/authMiddleware");

// Anyone: the overall score and a few of the best reviews, for the home page.
router.get("/featured", getFeaturedReviews);

// Admin-only: cross-room review moderation list + hide/unhide.
router.get("/", verifyToken, checkRole("admin"), listReviews);
router.patch("/:id/hide", verifyToken, checkRole("admin"), hideReview);

module.exports = router;
