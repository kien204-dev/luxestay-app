import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { currentTheme, onThemeChange, setTheme } from "../utils/theme";

const SUN = (
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
  </>
);
const MOON = <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />;

// Light/dark, for the guest header and the admin top bar (`className` is the
// icon-button style of whichever it sits in). Shows what a press switches
// to; the choice is remembered in this browser (utils/theme.js).
export default function ThemeSwitch({ className }) {
  const { t } = useTranslation("common");
  const dark = useSyncExternalStore(onThemeChange, currentTheme) === "dark";
  const label = dark ? t("theme.toLight") : t("theme.toDark");

  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      title={label}
      data-testid="theme-switch"
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {dark ? SUN : MOON}
      </svg>
    </button>
  );
}
