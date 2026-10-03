// Small formatting helpers shared by the guest pages. Dates are handled as
// plain "YYYY-MM-DD" strings throughout: a booking date is a calendar day at
// the property, never a moment in the visitor's timezone.

const LOCALES = { vi: "vi-VN", en: "en-US" };
const DAY_MS = 24 * 60 * 60 * 1000;

function localeOf(lang) {
  return LOCALES[lang] || LOCALES.vi;
}

export function formatMoney(value, lang = "vi") {
  const amount = (Number(value) || 0).toLocaleString(localeOf(lang));
  // The currency sign as written in each language. i18n-ignore
  return lang === "en" ? `${amount} VND` : `${amount} đ`; // i18n-ignore
}

function toUtcDate(dateStr) {
  return new Date(`${dateStr}T00:00:00Z`);
}

export function isDateString(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(toUtcDate(value).getTime());
}

export function formatDate(dateStr, lang = "vi") {
  if (!isDateString(dateStr)) return "";
  return toUtcDate(dateStr).toLocaleDateString(localeOf(lang), {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function addDays(dateStr, days) {
  return new Date(toUtcDate(dateStr).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

// Nights between two dates; 0 when either is missing or the range is empty.
export function nightsBetween(checkIn, checkOut) {
  if (!isDateString(checkIn) || !isDateString(checkOut)) return 0;
  return Math.max(0, Math.round((toUtcDate(checkOut) - toUtcDate(checkIn)) / DAY_MS));
}

export function monthLabel(year, month, lang = "vi") {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(localeOf(lang), {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  });
}
