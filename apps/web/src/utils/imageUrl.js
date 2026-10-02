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

// A grid of cards that all lack a photo should not show the same picture
// eight times. These variants pick a background colour and a motif from the
// card's name, so each card keeps the same look on every visit while
// neighbours differ. Still drawn here: nothing is fetched.
const PALETTES = [
  ["#0b2a66", "#001640", "#C5A059"],
  ["#0f4c5c", "#062a33", "#e9c46a"],
  ["#2d4a3e", "#14261f", "#d4b483"],
  ["#4a2c5a", "#24142e", "#e0b1cb"],
  ["#5a3a24", "#2b1a0f", "#f0c27b"],
  ["#1f3b73", "#0d1b3a", "#9ad1d4"],
];

const MOTIFS = {
  // Bed under a window, as in the default placeholder.
  bed: '<rect x="300" y="150" width="200" height="130" rx="6"/><path d="M400 150v130M300 215h200"/><path d="M230 430v-70a24 24 0 0 1 24-24h292a24 24 0 0 1 24 24v70"/><path d="M200 470v-40h400v40M200 430h400"/><rect x="270" y="296" width="110" height="40" rx="12"/><rect x="420" y="296" width="110" height="40" rx="12"/>',
  // Mountains under a sun.
  mountains: '<circle cx="560" cy="190" r="46"/><path d="M120 450l170-210 110 130 80-90 200 170"/><path d="M120 450h560"/>',
  // Waves and a sail.
  sea: '<path d="M140 400c40-30 80-30 120 0s80 30 120 0 80-30 120 0 80 30 120 0 80-30 120 0"/><path d="M140 460c40-30 80-30 120 0s80 30 120 0 80-30 120 0 80 30 120 0 80-30 120 0"/><path d="M400 170v190h-120z"/><path d="M410 200l90 160h-90"/>',
  // City skyline.
  city: '<path d="M140 450h520"/><path d="M180 450V300h70v150M270 450V220h80v230M370 450V330h60v120M450 450V260h90v190M560 450V340h60v110"/><path d="M290 260h40M290 300h40M470 300h50M470 340h50"/>',
};

function hashOf(text) {
  let hash = 0;
  for (const char of String(text)) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return hash;
}

const placeholderCache = new Map();

// kind: "room" draws the bed; "place" draws one of the landscape motifs.
export function placeholderFor(name, kind = "room") {
  const key = `${kind}:${name}`;
  if (placeholderCache.has(key)) return placeholderCache.get(key);

  const hash = hashOf(name);
  const [from, to, line] = PALETTES[hash % PALETTES.length];
  const landscapes = ["mountains", "sea", "city"];
  const motif = kind === "room" ? MOTIFS.bed : MOTIFS[landscapes[Math.floor(hash / PALETTES.length) % landscapes.length]];
  // Light diagonal stripes at an angle that also depends on the name.
  const angle = [20, 45, 70, 110, 135][hash % 5];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient><pattern id="p" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})"><path d="M0 0v28" stroke="#ffffff" stroke-opacity="0.05" stroke-width="10"/></pattern></defs><rect width="800" height="600" fill="url(#bg)"/><rect width="800" height="600" fill="url(#p)"/><g fill="none" stroke="${line}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.55" transform="translate(0 -60)">${motif}</g></svg>`;

  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  placeholderCache.set(key, uri);
  return uri;
}

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

// The same, under a name that is not mistaken for a React hook, for use in
// inline handlers: onError={(e) => showFallback(e, placeholder)}.
export const showFallback = useFallbackImage;
