const crypto = require("node:crypto");
const { APP_NAME } = require("../config/brand");

// Implements MoMo's "Payment with MoMo" (captureWallet) API as documented at
// https://developers.momo.vn/v3/docs/payment/api/wallet/onetime — the create
// request and the IPN callback each sign a *different* fixed field order
// (see MOMO_CREATE_SIGNATURE_FIELDS / MOMO_IPN_SIGNATURE_FIELDS below). This
// has not been exercised against a live MoMo sandbox merchant account (none
// was available while building this) — verify against real
// MOMO_PARTNER_CODE/MOMO_ACCESS_KEY/MOMO_SECRET_KEY credentials before
// relying on this in production.

// MoMo is beta (see the header note), so it stays off unless MOMO_ENABLED=true.
function isMomoEnabled() {
  return String(process.env.MOMO_ENABLED).toLowerCase() === "true";
}

function getMomoConfig() {
  return {
    partnerCode: process.env.MOMO_PARTNER_CODE,
    accessKey: process.env.MOMO_ACCESS_KEY,
    secretKey: process.env.MOMO_SECRET_KEY,
    apiUrl: process.env.MOMO_API_URL || "https://test-payment.momo.vn/v2/gateway/api/create",
    redirectUrl: process.env.MOMO_RETURN_URL,
    ipnUrl: process.env.MOMO_IPN_URL,
  };
}

function assertMomoConfigured() {
  const config = getMomoConfig();
  const missing = [];

  if (!config.partnerCode) missing.push("MOMO_PARTNER_CODE");
  if (!config.accessKey) missing.push("MOMO_ACCESS_KEY");
  if (!config.secretKey) missing.push("MOMO_SECRET_KEY");
  if (!config.redirectUrl) missing.push("MOMO_RETURN_URL");
  if (!config.ipnUrl) missing.push("MOMO_IPN_URL");

  if (missing.length > 0) {
    throw new Error(`MoMo is not configured. Missing: ${missing.join(", ")}`);
  }

  return config;
}

function sign(rawSignature, secretKey) {
  return crypto.createHmac("sha256", secretKey).update(rawSignature, "utf-8").digest("hex");
}

// amount: number, in whole VND — unlike VNPay, MoMo takes the actual amount
// (no x100 convention).
async function createMomoPayUrl({ amount, transactionRef, orderInfo }) {
  const config = assertMomoConfigured();
  const requestId = transactionRef;
  const orderId = transactionRef;
  const amountStr = String(Math.round(amount));
  const extraData = "";
  const requestType = "captureWallet";

  const rawSignature =
    `accessKey=${config.accessKey}&amount=${amountStr}&extraData=${extraData}` +
    `&ipnUrl=${config.ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}` +
    `&partnerCode=${config.partnerCode}&redirectUrl=${config.redirectUrl}` +
    `&requestId=${requestId}&requestType=${requestType}`;

  const signature = sign(rawSignature, config.secretKey);

  const body = {
    partnerCode: config.partnerCode,
    partnerName: APP_NAME,
    requestId,
    amount: amountStr,
    orderId,
    orderInfo,
    redirectUrl: config.redirectUrl,
    ipnUrl: config.ipnUrl,
    lang: "vi",
    extraData,
    requestType,
    signature,
  };

  const response = await fetch(config.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (data.resultCode !== 0 || !data.payUrl) {
    throw new Error(`MoMo create-payment failed: ${data.message || "unknown error"}`);
  }

  return data.payUrl;
}

// body: the IPN POST body (parsed JSON). Returns { valid }.
function verifyMomoSignature(body) {
  const config = assertMomoConfigured();
  const {
    partnerCode, orderId, requestId, amount, orderInfo, orderType,
    transId, resultCode, message, payType, responseTime, extraData, signature,
  } = body;

  if (!signature) return { valid: false };

  const rawSignature =
    `accessKey=${config.accessKey}&amount=${amount}&extraData=${extraData}` +
    `&message=${message}&orderId=${orderId}&orderInfo=${orderInfo}` +
    `&orderType=${orderType}&partnerCode=${partnerCode}&payType=${payType}` +
    `&requestId=${requestId}&responseTime=${responseTime}&resultCode=${resultCode}` +
    `&transId=${transId}`;

  const expected = sign(rawSignature, config.secretKey);

  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(String(signature), "hex");
  const valid =
    expectedBuf.length === receivedBuf.length &&
    crypto.timingSafeEqual(expectedBuf, receivedBuf);

  return { valid };
}

module.exports = {
  assertMomoConfigured,
  isMomoEnabled,
  createMomoPayUrl,
  verifyMomoSignature,
};
