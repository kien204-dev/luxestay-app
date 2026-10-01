export const FALLBACK_ROOM_IMAGE =
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&auto=format&fit=crop&q=80";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
const BACKEND_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, "").replace(/\/$/, "");

export function normalizeImageUrl(image, fallback = FALLBACK_ROOM_IMAGE) {
  if (!image || typeof image !== "string") return fallback;

  const value = image.trim();
  if (!value) return fallback;

  if (/^https?:\/\//i.test(value)) return value;

  if (value.startsWith("/uploads")) {
    return `${BACKEND_BASE_URL}${value}`;
  }

  return value;
}

export function useFallbackImage(event, fallback = FALLBACK_ROOM_IMAGE) {
  if (event.currentTarget.src !== fallback) {
    event.currentTarget.src = fallback;
  }
}
