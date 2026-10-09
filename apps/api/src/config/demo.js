// Demo mode (DEMO_MODE=true): a public demo where anyone can sign in with the
// sample accounts. Those accounts can try the booking and admin flows, but
// cannot change what would spoil the demo for the next visitor: they cannot
// delete anything, manage users, change the property's identity or photos,
// edit existing rooms, or change their own password or email. The data is
// put back with `npm run demo:reset` (run it on a schedule) or every
// DEMO_RESET_INTERVAL_HOURS hours by the API itself.

function isDemoMode() {
  return process.env.DEMO_MODE === "true";
}

function demoResetIntervalHours() {
  const hours = Number(process.env.DEMO_RESET_INTERVAL_HOURS);
  return Number.isFinite(hours) && hours > 0 ? hours : 0;
}

// True when every payment gateway that is switched on points at its
// provider's test environment, so no real money can move. The demo banner
// only says "no real money is charged" when this holds: demo mode itself
// does not replace the gateways.
function demoUsesTestPayments() {
  const vnpayUrl = process.env.VNPAY_PAY_URL || "https://sandbox.vnpayment.vn/";
  const momoOn = String(process.env.MOMO_ENABLED).toLowerCase() === "true";
  const momoUrl = process.env.MOMO_API_URL || "https://test-payment.momo.vn/";
  const host = (url) => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  };
  return host(vnpayUrl) === "sandbox.vnpayment.vn" && (!momoOn || host(momoUrl) === "test-payment.momo.vn");
}

// The sample accounts a demo visitor signs in with (see db/seed.js).
function demoAccounts() {
  const { getSeedAccounts } = require("../db/seed");
  return getSeedAccounts().map(({ email, password, role }) => ({ email, password, role }));
}

function isDemoAccount(email) {
  if (!isDemoMode() || !email) return false;
  return demoAccounts().some((account) => account.email === String(email).toLowerCase());
}

// Requests a demo account may not make. Paths are matched without the query.
const BLOCKED = [
  { methods: ["DELETE"], path: /^\/api\// },
  { methods: ["POST"], path: /^\/api\/users\/?$/ },
  { methods: ["PUT", "PATCH"], path: /^\/api\/users\/(?!me\/avatar$)[^/]+(\/.*)?$/ },
  { methods: ["PUT", "POST"], path: /^\/api\/settings(\/.*)?$/ },
  { methods: ["POST", "PUT"], path: /^\/api\/destinations\// },
  { methods: ["PUT"], path: /^\/api\/rooms\/[^/]+$/ },
  { methods: ["POST"], path: /^\/api\/rooms\/[^/]+\/images$/ },
];

function isBlockedForDemo(method, url) {
  const path = String(url).split("?")[0];
  return BLOCKED.some((rule) => rule.methods.includes(method) && rule.path.test(path));
}

module.exports = { demoAccounts, demoResetIntervalHours, demoUsesTestPayments, isBlockedForDemo, isDemoAccount, isDemoMode };
