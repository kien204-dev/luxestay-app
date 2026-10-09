// The one place the web app's identity comes from. Everything here is set
// through VITE_* variables (apps/web/.env, or the Docker build), so a buyer
// rebrands without touching components. Translations use the name as {{brand}}.

const env = import.meta.env;
const text = (value) => (value || "").trim();

export const APP_NAME = text(env.VITE_APP_NAME) || "LuxeStay";

// Language shown to a first-time visitor ("vi" or "en"); also the <html lang>.
export const SUPPORTED_LANGUAGES = ["vi", "en"];
export const DEFAULT_LANGUAGE = SUPPORTED_LANGUAGES.includes(text(env.VITE_DEFAULT_LANGUAGE))
  ? text(env.VITE_DEFAULT_LANGUAGE)
  : "vi";

// Shown in the site footer. Anything left empty is simply not rendered.
export const CONTACT = {
  phone: text(env.VITE_CONTACT_PHONE),
  email: text(env.VITE_CONTACT_EMAIL),
  address: text(env.VITE_CONTACT_ADDRESS),
};

import { readThemeColors } from "../utils/themeColors";

// First letter of the name, for the monogram used as logo mark and favicon.
export const BRAND_INITIAL = (Array.from(APP_NAME)[0] || "L").toUpperCase();

// A favicon drawn from the brand itself (monogram on the accent colour), so
// rebranding does not leave another product's icon in the browser tab.
// Colours come from the theme (--accent / --on-accent).
export function brandFaviconDataUri(initial = BRAND_INITIAL) {
  const { accent, onAccent } = readThemeColors();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<rect width="64" height="64" rx="8" fill="${accent}"/>` +
    `<text x="32" y="44" text-anchor="middle" font-family="'Times New Roman', serif" ` +
    `font-size="38" font-weight="700" fill="${onAccent}">${initial}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
