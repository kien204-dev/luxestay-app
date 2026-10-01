// Bookings are calendar dates at the property, so "today" has to mean today
// where the property is, not wherever the server (often UTC) happens to run.
const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";

function getAppTimezone() {
  return process.env.APP_TIMEZONE || DEFAULT_TIMEZONE;
}

function isValidTimezone(timezone) {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

// "YYYY-MM-DD" for the given instant in the given timezone.
function dateInTimezone(now = new Date(), timezone = getAppTimezone()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function todayInAppTimezone(now = new Date()) {
  return dateInTimezone(now, getAppTimezone());
}

// Whole days from one "YYYY-MM-DD" to another (negative if `to` is earlier).
function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

module.exports = {
  DEFAULT_TIMEZONE,
  dateInTimezone,
  daysBetween,
  getAppTimezone,
  isValidTimezone,
  todayInAppTimezone,
};
