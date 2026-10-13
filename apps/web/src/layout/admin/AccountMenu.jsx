import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AxIcon from "../../components/admin/AxIcon";
import { useAuth } from "../../context/AuthContext";
import { currentTheme, onThemeChange, setTheme } from "../../utils/theme";
import { normalizeImageUrl } from "../../utils/imageUrl";
import { useDismiss } from "./useDismiss";

export function initials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const letters = parts.length === 1 ? [parts[0][0]] : [parts[0][0], parts.at(-1)[0]];
  return letters.join("").toUpperCase();
}

export function Avatar({ user, small = false }) {
  const src = user?.avatar_url ? normalizeImageUrl(user.avatar_url, "") : "";
  return (
    <span className={`ax-avatar${small ? " ax-avatar--sm" : ""}`} aria-hidden="true">
      {src ? <img src={src} alt="" /> : initials(user?.name)}
    </span>
  );
}

// The signed-in admin: profile, password, light/dark, language, sign out.
// `compact`: the avatar alone (the phone bar).
export default function AccountMenu({ compact = false, testId = "account-menu" }) {
  const { t, i18n } = useTranslation("admin");
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const dark = useSyncExternalStore(onThemeChange, currentTheme) === "dark";
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const button = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(box, open, close, button);

  const role = t(`roles.${user?.role}`, { defaultValue: user?.role || "" });
  const languages = Object.keys(i18n.options.resources || {});

  return (
    <div ref={box} className="ax-dd-anchor">
      <button
        ref={button}
        type="button"
        className="ax-acct"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={compact ? t("account.label", { name: user?.name || "" }) : undefined}
        onClick={() => setOpen((value) => !value)}
        data-testid={`${testId}-button`}
      >
        <Avatar user={user} small={compact} />
        {!compact && (
          <>
            <span className="ax-acct__text">
              <b>{user?.name}</b>
              <small>{role}</small>
            </span>
            <AxIcon name="chevronDown" small />
          </>
        )}
      </button>

      {open && (
        <div className="ax-dd ax-dd--acct" role="menu" aria-label={t("account.title")} data-testid={testId}>
          <div className="ax-dd__who">
            <b>{user?.name}</b>
            <span>{[user?.email, role].filter(Boolean).join(" · ")}</span>
          </div>
          <div className="ax-dd__sep" role="separator" />
          <Link role="menuitem" className="ax-option" to="/settings" onClick={close}>
            <AxIcon name="user" />
            {t("account.profile")}
          </Link>
          <Link role="menuitem" className="ax-option" to="/settings/password" onClick={close}>
            <AxIcon name="lock" />
            {t("account.password")}
          </Link>
          <button role="menuitem" type="button" className="ax-option" onClick={() => setTheme(dark ? "light" : "dark")} data-testid={`${testId}-theme`}>
            <AxIcon name={dark ? "moon" : "sun"} />
            {t("account.theme", { theme: dark ? t("account.dark") : t("account.light") })}
            <small>{dark ? t("account.toLight") : t("account.toDark")}</small>
          </button>
          <div className="ax-option ax-option--static">
            <AxIcon name="globe" />
            <span id={`${testId}-lang`}>{t("account.language")}</span>
            <span className="ax-lang" role="group" aria-labelledby={`${testId}-lang`}>
              {languages.map((lng) => (
                <button key={lng} type="button" role="menuitemradio" aria-checked={i18n.resolvedLanguage === lng} aria-pressed={i18n.resolvedLanguage === lng} onClick={() => i18n.changeLanguage(lng)}>
                  {lng.toUpperCase()}
                </button>
              ))}
            </span>
          </div>
          <div className="ax-dd__sep" role="separator" />
          <button
            role="menuitem"
            type="button"
            className="ax-option ax-option--danger"
            onClick={() => {
              close();
              logout();
              navigate("/");
            }}
          >
            <AxIcon name="logout" />
            {t("account.logout")}
          </button>
        </div>
      )}
    </div>
  );
}
