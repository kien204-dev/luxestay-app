// Shown wherever a room has no photo (or its photo fails to load). Drawn
// here as an inline SVG, so nothing is fetched from another site: a navy
// panel with a gold line drawing of a bed under a window.
const PLACEHOLDER_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b2a66"/>
      <stop offset="1" stop-color="#001640"/>
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#bg)"/>
  <g fill="none" stroke="#C5A059" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.9">
    <rect x="300" y="150" width="200" height="130" rx="6"/>
    <path d="M400 150v130M300 215h200"/>
    <path d="M230 430v-70a24 24 0 0 1 24-24h292a24 24 0 0 1 24 24v70"/>
    <path d="M200 470v-40h400v40M200 430h400"/>
    <rect x="270" y="296" width="110" height="40" rx="12"/>
    <rect x="420" y="296" width="110" height="40" rx="12"/>
  </g>
</svg>`;

export const ROOM_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(
  PLACEHOLDER_SVG.replace(/\s+/g, " ").trim()
)}`;

// Kept under its old name for the admin pages that already import it.
export const FALLBACK_ROOM_IMAGE = ROOM_PLACEHOLDER;

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
const BACKEND_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "").replace(/\/$/, "");

export function normalizeImageUrl(image, fallback = ROOM_PLACEHOLDER) {
  if (!image || typeof image !== "string") return fallback;

  const value = image.trim();
  if (!value) return fallback;

  if (/^https?:\/\//i.test(value)) return value;

  if (value.startsWith("/uploads")) {
    return `${BACKEND_BASE_URL}${value}`;
  }

  return value;
}

// onError handler for <img>: swap a broken photo for the placeholder, once.
export function useFallbackImage(event, fallback = ROOM_PLACEHOLDER) {
  if (event.currentTarget.src !== fallback) {
    event.currentTarget.src = fallback;
  }
}
