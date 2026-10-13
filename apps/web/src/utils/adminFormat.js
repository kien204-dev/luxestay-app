import i18n from "../i18n";

// Number and date wording of the admin screens.

const LOCALES = { vi: "vi-VN", en: "en-US" };
const locale = (lang) => LOCALES[lang] || LOCALES.vi;

export function formatNumber(value, lang, digits = 0) {
  return (Number(value) || 0).toLocaleString(locale(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

// A large amount as "1,28" + "tỷ" (or "1.28" + "B"): the unit is shown
// smaller next to the figure. Under a million it is written in full.
export function compactMoney(value, lang) {
  const amount = Number(value) || 0;
  const abs = Math.abs(amount);
  if (abs >= 1e9) return { value: formatNumber(amount / 1e9, lang, 2), unit: i18n.t("dashboard:units.billion") };
  if (abs >= 1e6) return { value: formatNumber(amount / 1e6, lang, abs >= 1e8 ? 0 : 1), unit: i18n.t("dashboard:units.million") };
  return { value: formatNumber(amount, lang), unit: i18n.t("dashboard:units.currency") };
}

// A short axis label for an amount: "250 tr", "1,2 tỷ".
export function axisMoney(value, lang) {
  if (!value) return "0";
  const { value: figure, unit } = compactMoney(value, lang);
  return `${figure.replace(/[,.]0+$/, "")} ${unit}`;
}

export function percent(fraction, lang, digits = 1) {
  return formatNumber((Number(fraction) || 0) * 100, lang, digits);
}

const utc = (date) => new Date(`${date}T00:00:00Z`);

const pad = (n) => String(n).padStart(2, "0");
const parts = (date) => ({ y: date.slice(0, 4), m: date.slice(5, 7), d: date.slice(8, 10) });
const monthShort = (date) => utc(date).toLocaleDateString("en-US", { timeZone: "UTC", month: "short" });

// "02/10" or, when `year`, "02/10/2026" ("Oct 2", "Oct 2, 2026" in English).
export function dayMonth(date, lang, year = false) {
  const { y, m, d } = parts(date);
  if (lang === "en") return `${monthShort(date)} ${Number(d)}${year ? `, ${y}` : ""}`;
  return `${d}/${m}${year ? `/${y}` : ""}`;
}

// "02/10 – 08/10/2026" (the year once when both dates share it).
export function rangeText(from, to, lang) {
  if (from === to) return dayMonth(from, lang, true);
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${dayMonth(from, lang, !sameYear)} – ${dayMonth(to, lang, true)}`;
}

// "24 – 27/10" for a stay in one month, "30/10 – 02/11" otherwise.
export function stayText(checkIn, checkOut, lang) {
  if (!checkIn || !checkOut) return "";
  if (checkIn.slice(0, 7) === checkOut.slice(0, 7)) {
    return lang === "en"
      ? `${monthShort(checkIn)} ${Number(parts(checkIn).d)} – ${Number(parts(checkOut).d)}`
      : `${parts(checkIn).d} – ${dayMonth(checkOut, lang)}`;
  }
  return `${dayMonth(checkIn, lang)} – ${dayMonth(checkOut, lang)}`;
}

// "14:05" in the browser's time.
export function clock(moment) {
  const at = new Date(moment);
  return `${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

// "09:41, 07/10/2026" (`year` false: "09:41, 07/10") in the browser's time.
export function momentText(moment, lang, year = true) {
  const at = new Date(moment);
  return `${clock(moment)}, ${dayMonth(`${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`, lang, year)}`;
}

// "Thứ Bảy, 03/10" / "Saturday, Oct 3".
export function longDay(date, lang) {
  const weekday = utc(date).toLocaleDateString(locale(lang), { timeZone: "UTC", weekday: "long" });
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${dayMonth(date, lang)}`;
}

// "T7" / "Sat".
export function shortWeekday(date) {
  return i18n.t(`dashboard:weekday.${utc(date).getUTCDay()}`);
}

// "2 phút trước", "Hôm qua", "12/10" for a moment (an ISO timestamp)
// relative to `now` (milliseconds).
export function timeAgo(moment, now, lang) {
  if (!moment) return "";
  const at = new Date(moment).getTime();
  const minutes = Math.max(0, Math.round((now - at) / 60000));
  const format = new Intl.RelativeTimeFormat(lang === "en" ? "en" : "vi", { numeric: "auto" });
  if (minutes < 60) return format.format(-minutes, "minute");
  if (minutes < 24 * 60) return format.format(-Math.round(minutes / 60), "hour");
  const days = Math.round(minutes / (24 * 60));
  if (days < 7) return format.format(-days, "day");
  const local = new Date(at);
  return dayMonth(`${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`, lang);
}

// Change against the period before, or null when there is nothing to
// compare with.
export function change(current, before) {
  if (current === null || current === undefined || !before) return null;
  return (current - before) / before;
}
