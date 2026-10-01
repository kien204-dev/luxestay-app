const express = require("express");
const router = express.Router();

const {
  getDashboardStats,
  getDashboardAnalytics,
  exportDashboardReport,
} = require("../controller/dashboardController.js");
const { verifyToken, checkRole } = require("../middleware/authMiddleware");

router.get("/stats", verifyToken, checkRole("admin"), getDashboardStats);
router.get("/analytics", verifyToken, checkRole("admin"), getDashboardAnalytics);
router.get("/export", verifyToken, checkRole("admin"), exportDashboardReport);

module.exports = router;
