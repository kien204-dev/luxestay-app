import { useSyncExternalStore } from "react";

// Whether a CSS media query matches now, updated as the window changes.
export function useMedia(query) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

// The admin area's sizes (admin-shell.css): a phone below 768px, a tablet
// below 1280px.
export const PHONE_QUERY = "(max-width: 767px)";
export const NARROW_QUERY = "(max-width: 1279px)";
