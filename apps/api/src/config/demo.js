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

module.exports = { demoAccounts, demoResetIntervalHours, isBlockedForDemo, isDemoAccount, isDemoMode };
