// Light or dark. <html data-theme> selects the token set in index.css. It
// follows the visitor's system setting until they pick one with the header
// switch; the pick is remembered in this browser. index.html sets the
// attribute before the first paint with the same rule, so a dark page never
// flashes light while the app loads.

const STORAGE_KEY = "luxestay_theme";
const THEMES = ["light", "dark"];
const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)");

// Storage can be unavailable (private mode, blocked cookies): the switch
// then still works for the visit, it is just not remembered.
function storedTheme() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event("themechange"));
}

export function setTheme(theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not remembered; see storedTheme().
  }
  apply(theme);
}

// Calls `listener` whenever the theme changes; returns the unsubscribe.
export function onThemeChange(listener) {
  window.addEventListener("themechange", listener);
  return () => window.removeEventListener("themechange", listener);
}

// A visitor who has not chosen keeps following their system as it changes
// (for instance at sunset).
systemDark().addEventListener("change", (event) => {
  if (!storedTheme()) apply(event.matches ? "dark" : "light");
});
