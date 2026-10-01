const express = require("express");
const router = express.Router();

const {
  createPayment,
  getPaymentProviders,
  getPaymentForBooking,
  getPaymentByTransactionRef,
  vnpayIpn,
  momoIpn,
} = require("../controller/paymentController.js");

const { verifyToken } = require("../middleware/authMiddleware");

router.get("/providers", getPaymentProviders);
router.post("/bookings/:id", verifyToken, createPayment);
router.get("/bookings/:id", verifyToken, getPaymentForBooking);
router.get("/transactions/:ref", verifyToken, getPaymentByTransactionRef);

// Called server-to-server by the payment gateways — no user session/cookie
// involved, signature verification inside the controller is the auth.
router.get("/vnpay/ipn", vnpayIpn);
router.post("/momo/ipn", momoIpn);

module.exports = router;
