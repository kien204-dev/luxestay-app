// The one place the product name comes from on the API side (emails, payment
// descriptions, exported reports). Set APP_NAME to rebrand.
const APP_NAME = (process.env.APP_NAME || "LuxeStay").trim() || "LuxeStay";

module.exports = { APP_NAME };
