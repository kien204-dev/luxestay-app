const express = require("express");
const router = express.Router();

const {
  validateCoupon,
  listCoupons,
  createCoupon,
  updateCoupon,
  setCouponActive,
} = require("../controller/couponController.js");

const { verifyToken, checkRole } = require("../middleware/authMiddleware");

// Any authenticated (logged-in) user can preview a coupon before booking.
router.post("/validate", verifyToken, validateCoupon);

// Admin-only management.
router.get("/", verifyToken, checkRole("admin"), listCoupons);
router.post("/", verifyToken, checkRole("admin"), createCoupon);
router.put("/:id", verifyToken, checkRole("admin"), updateCoupon);
router.patch("/:id/active", verifyToken, checkRole("admin"), setCouponActive);

module.exports = router;
