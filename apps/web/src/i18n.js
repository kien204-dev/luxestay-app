import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { APP_NAME } from "./config/brand";

import viCommon from "./locales/vi/common.json";
import viBooking from "./locales/vi/booking.json";
import viAuth from "./locales/vi/auth.json";
import viMyBookings from "./locales/vi/myBookings.json";
import viDashboard from "./locales/vi/dashboard.json";
import enCommon from "./locales/en/common.json";
import enBooking from "./locales/en/booking.json";
import enAuth from "./locales/en/auth.json";
import enMyBookings from "./locales/en/myBookings.json";
import enDashboard from "./locales/en/dashboard.json";

// Namespaces are added here incrementally, one per page, as i18n coverage
// rolls out page by page rather than all at once.
const resources = {
  vi: {
    common: viCommon,
    booking: viBooking,
    auth: viAuth,
    myBookings: viMyBookings,
    dashboard: viDashboard,
  },
  en: {
    common: enCommon,
    booking: enBooking,
    auth: enAuth,
    myBookings: enMyBookings,
    dashboard: enDashboard,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    // The product targets Vietnamese hotels (34-province Vietnam data) —
    // Vietnamese is the actual default, not just a fallback. Deliberately
    // no "navigator" in the detection order: a first-time visitor with an
    // English browser locale should still see Vietnamese first and choose
    // English explicitly, not have it auto-selected for them.
    fallbackLng: "vi",
    ns: ["common", "booking", "auth", "myBookings", "dashboard"],
    defaultNS: "common",
    detection: {
      order: ["localStorage"],
      caches: ["localStorage"],
      lookupLocalStorage: "luxestay_lang",
    },
    interpolation: {
      escapeValue: false, // React already escapes values
      // Translations say {{brand}} instead of hardcoding the product name.
      defaultVariables: { brand: APP_NAME },
    },
  });

export default i18n;
