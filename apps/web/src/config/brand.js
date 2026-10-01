// The one place the product name comes from in the web app. Set
// VITE_APP_NAME (apps/web/.env) to rebrand; translations use it as {{brand}}.
export const APP_NAME = (import.meta.env.VITE_APP_NAME || "").trim() || "LuxeStay";
