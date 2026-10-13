const express = require("express");
const router = express.Router();

const {
  getBookings,
  getBookingById,
  getBookingCalendar,
  getBookingTimeline,
  getBookingPolicy,
  getBookingCounts,
  getBookingSummary,
  getBookingReceipt,
  markBookingPaid,
  confirmRefund,
  createBooking,
  updateBookingStatus,
  cancelBooking,
  deleteBooking,
} = require("../controller/bookingController.js");

const { verifyToken, checkRole } = require("../middleware/authMiddleware");

router.get("/", verifyToken, getBookings);
router.get("/policy", getBookingPolicy);
router.get("/counts", verifyToken, getBookingCounts);
router.get("/summary", verifyToken, checkRole("admin"), getBookingSummary);
router.get("/timeline", verifyToken, checkRole("admin"), getBookingTimeline);
router.get("/calendar", verifyToken, checkRole("admin"), getBookingCalendar);
router.get("/:id/receipt", verifyToken, getBookingReceipt);
router.get("/:id", verifyToken, getBookingById);
router.post("/", verifyToken, createBooking);
router.patch("/:id/cancel", verifyToken, cancelBooking);
router.patch("/:id/mark-paid", verifyToken, checkRole("admin"), markBookingPaid);
router.patch("/:id/refund", verifyToken, checkRole("admin"), confirmRefund);
router.put("/:id", verifyToken, checkRole("admin"), updateBookingStatus);
router.delete("/:id", verifyToken, checkRole("admin"), deleteBooking);

module.exports = router;
