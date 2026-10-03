import { readThemeColors } from "./themeColors";

// Shown wherever there is no photo (or it fails to load). Drawn here as an
// inline SVG, so nothing is fetched from another site. The colours come from
// the theme, and a grid of cards that all lack a photo should not show the
// same picture eight times: each name picks a shade of the brand colour, a
// texture and a motif, so a card looks the same on every visit while its
// neighbours differ.

function parseRgb(color) {
  const [r = 0, g = 35, b = 102] = (String(color).match(/[\d.]+/g) || []).map(Number);
  return [r, g, b];
}

const toHex = (rgb) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
const mix = (a, b, weight) => a.map((v, i) => v * (1 - weight) + b[i] * weight);

// Six shades built from the theme: the primary colour, deepened, and nudged
// towards five neighbouring tones.
function themePalettes() {
  const { primary, accent } = readThemeColors();
  const base = parseRgb(primary);
  const line = toHex(parseRgb(accent));
  const tints = [base, [20, 90, 110], [40, 85, 60], [90, 45, 110], [110, 70, 40], [40, 70, 140]];
  return tints.map((tint, i) => {
    const from = i === 0 ? base : mix(base, tint, 0.45);
    return [toHex(from), toHex(mix(from, [0, 0, 0], 0.45)), line];
  });
}

let palettes = null;

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

// The plain room placeholder (bed under a window) in the theme's colours.
export function roomPlaceholder() {
  return placeholderFor("", "room");
}

// kind: "room" draws the bed; "place" draws one of the landscape motifs.
export function placeholderFor(name, kind = "room") {
  const key = `${kind}:${name}`;
  if (placeholderCache.has(key)) return placeholderCache.get(key);

  // Independent picks from different bits of the hash: 6 colours x 3
  // textures x 4 angles (x 3 motifs for places), so two cards rarely match.
  const hash = hashOf(name);
  const pick = (count, shift) => (hash >>> shift) % count;
  palettes = palettes || themePalettes();
  const [from, to, line] = palettes[pick(palettes.length, 0)];
  const landscapes = ["mountains", "sea", "city"];
  const motif = kind === "room" ? MOTIFS.bed : MOTIFS[landscapes[pick(landscapes.length, 8)]];
  const angle = [20, 60, 110, 150][pick(4, 12)];
  const texture = [
    '<path d="M0 0v28" stroke="#ffffff" stroke-opacity="0.06" stroke-width="10"/>',
    '<circle cx="14" cy="14" r="3" fill="#ffffff" fill-opacity="0.08"/>',
    '<path d="M0 0h28M0 0v28" stroke="#ffffff" stroke-opacity="0.07" stroke-width="2"/>',
  ][pick(3, 16)];

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient><pattern id="p" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(${angle})">${texture}</pattern></defs><rect width="800" height="600" fill="url(#bg)"/><rect width="800" height="600" fill="url(#p)"/><g fill="none" stroke="${line}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" opacity="0.55" transform="translate(0 -60)">${motif}</g></svg>`;

  const uri = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  placeholderCache.set(key, uri);
  return uri;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
const BACKEND_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "").replace(/\/$/, "");

export function normalizeImageUrl(image, fallback = roomPlaceholder()) {
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
export function useFallbackImage(event, fallback = roomPlaceholder()) {
  if (event.currentTarget.src !== fallback) {
    event.currentTarget.src = fallback;
  }
}

// The same, under a name that is not mistaken for a React hook, for use in
// inline handlers: onError={(e) => showFallback(e, placeholder)}.
export const showFallback = useFallbackImage;
