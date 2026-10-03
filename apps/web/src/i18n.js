import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { APP_NAME, DEFAULT_LANGUAGE, SUPPORTED_LANGUAGES } from "./config/brand";

// Every locales/<language>/<namespace>.json is picked up automatically:
// adding a language is a matter of adding its folder (and listing it in
// SUPPORTED_LANGUAGES, config/brand.js). See docs/customization.md.
const files = import.meta.glob("./locales/*/*.json", { eager: true, import: "default" });
const resources = {};
for (const [file, messages] of Object.entries(files)) {
  const [, language, namespace] = file.match(/\.\/locales\/([^/]+)\/([^/]+)\.json$/);
  resources[language] = { ...(resources[language] || {}), [namespace]: messages };
}
const namespaces = Object.keys(resources[DEFAULT_LANGUAGE] || resources.vi);

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
    ns: namespaces,
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
