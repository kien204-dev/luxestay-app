import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { APP_NAME, DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "./config/brand";

import viCommon from "./locales/vi/common.json";
import viSite from "./locales/vi/site.json";
import viAuth from "./locales/vi/auth.json";
import viMyBookings from "./locales/vi/myBookings.json";
import viDashboard from "./locales/vi/dashboard.json";
import enCommon from "./locales/en/common.json";
import enSite from "./locales/en/site.json";
import enAuth from "./locales/en/auth.json";
import enMyBookings from "./locales/en/myBookings.json";
import enDashboard from "./locales/en/dashboard.json";

// Namespaces are added here incrementally, one per page, as i18n coverage
// rolls out page by page rather than all at once.
const resources = {
  vi: {
    common: viCommon,
    site: viSite,
    auth: viAuth,
    myBookings: viMyBookings,
    dashboard: viDashboard,
  },
  en: {
    common: enCommon,
    site: enSite,
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
    // A first-time visitor sees the property's own default language
    // (VITE_DEFAULT_LANGUAGE), whatever their browser is set to, and can
    // switch from the header. Their choice is remembered.
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    ns: ["common", "site", "auth", "myBookings", "dashboard"],
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

// Keep <html lang> in step with the language actually shown (screen readers
// and browser translation rely on it).
function syncDocumentLanguage(language) {
  document.documentElement.lang = SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
}
syncDocumentLanguage(i18n.resolvedLanguage || i18n.language);
i18n.on("languageChanged", syncDocumentLanguage);

export default i18n;
