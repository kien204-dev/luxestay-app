const crypto = require("node:crypto");
const { getPublicWebUrl } = require("./allowedOrigins");

// Implements VNPay's "Payment URL" (API v2.1.0) signing scheme as documented
// at https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html: the
// HMAC-SHA512 sign data is built from the sorted key=value pairs using the
// *same* application/x-www-form-urlencoded encoding as the final query
// string (spaces as "+"), not raw unencoded values — verified against a real
// VNPay sandbox merchant account (an earlier raw-value version returned
// VNPay's "Invalid signature" / code 70 error; this encoded version was
// confirmed accepted).

const PAYMENT_RESULT_PATH = "/payment/result";

function getVnpayConfig() {
  return {
    tmnCode: process.env.VNPAY_TMN_CODE,
    hashSecret: process.env.VNPAY_HASH_SECRET,
    payUrl: process.env.VNPAY_PAY_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
    // Where VNPay sends the guest back to. Follows the web address unless
    // set explicitly.
    returnUrl: process.env.VNPAY_RETURN_URL || `${getPublicWebUrl()}${PAYMENT_RESULT_PATH}`,
  };
}

function assertVnpayConfigured() {
  const config = getVnpayConfig();
  const missing = [];

  if (!config.tmnCode) missing.push("VNPAY_TMN_CODE");
  if (!config.hashSecret) missing.push("VNPAY_HASH_SECRET");

  if (missing.length > 0) {
    throw new Error(`VNPay is not configured. Missing: ${missing.join(", ")}`);
  }

  return config;
}

function sortParams(params) {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== "")
    .sort()
    .reduce((sorted, key) => {
      sorted[key] = params[key];
      return sorted;
    }, {});
}

function buildSignData(sortedParams) {
  return new URLSearchParams(sortedParams).toString();
}

function signVnpayParams(sortedParams, hashSecret) {
  const signData = buildSignData(sortedParams);
  return crypto.createHmac("sha512", hashSecret).update(signData, "utf-8").digest("hex");
}

// VNPay expects a plain IPv4 address. Express's req.ip is often "::1" for
// local loopback, or "::ffff:x.x.x.x" behind some proxies — normalize both
// to a real IPv4 form instead of sending VNPay a value it may reject.
function normalizeIpAddr(ipAddr) {
  if (!ipAddr) return "127.0.0.1";
  if (ipAddr === "::1") return "127.0.0.1";
  const mapped = ipAddr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? mapped[1] : ipAddr;
}

// VNPay reads vnp_CreateDate / vnp_ExpireDate as GMT+7 wall-clock time
// (yyyyMMddHHmmss), whatever timezone this server runs in. Vietnam has no
// daylight saving, so a fixed +7h shift read back through UTC getters is exact.
const VNPAY_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

function formatVnpayDate(date) {
  const shifted = new Date(date.getTime() + VNPAY_UTC_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${shifted.getUTCFullYear()}${pad(shifted.getUTCMonth() + 1)}${pad(shifted.getUTCDate())}` +
    `${pad(shifted.getUTCHours())}${pad(shifted.getUTCMinutes())}${pad(shifted.getUTCSeconds())}`
  );
}

// amount: number, in whole VND. VNPay's protocol always represents amounts
// multiplied by 100 (a fixed convention of theirs, unrelated to VND having
// no minor unit).
function buildVnpayPayUrl({ amount, transactionRef, orderInfo, ipAddr, expiresAt }) {
  const config = assertVnpayConfigured();
  const now = new Date();

  const params = sortParams({
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: config.tmnCode,
    vnp_Amount: String(Math.round(amount * 100)),
    vnp_CurrCode: "VND",
    vnp_TxnRef: transactionRef,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: "other",
    vnp_Locale: "vn",
    vnp_ReturnUrl: config.returnUrl,
    vnp_IpAddr: normalizeIpAddr(ipAddr),
    vnp_CreateDate: formatVnpayDate(now),
    vnp_ExpireDate: expiresAt ? formatVnpayDate(expiresAt) : undefined,
  });

  const secureHash = signVnpayParams(params, config.hashSecret);
  const query = new URLSearchParams({ ...params, vnp_SecureHash: secureHash });

  return `${config.payUrl}?${query.toString()}`;
}

// query: the IPN/return request's query params (already URL-decoded by
// Express). Returns { valid, params } with vnp_SecureHash(Type) stripped out.
function verifyVnpaySignature(query) {
  const config = assertVnpayConfigured();
  const { vnp_SecureHash: receivedHash, vnp_SecureHashType: _type, ...rest } = query;

  if (!receivedHash) {
    return { valid: false, params: rest };
  }

  const sorted = sortParams(rest);
  const expectedHash = signVnpayParams(sorted, config.hashSecret);

  const expectedBuf = Buffer.from(expectedHash, "hex");
  const receivedBuf = Buffer.from(String(receivedHash), "hex");
  const valid =
    expectedBuf.length === receivedBuf.length &&
    crypto.timingSafeEqual(expectedBuf, receivedBuf);

  return { valid, params: rest };
}

module.exports = {
  assertVnpayConfigured,
  getVnpayConfig,
  formatVnpayDate,
  buildVnpayPayUrl,
  verifyVnpaySignature,
};
