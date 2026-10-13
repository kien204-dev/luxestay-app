import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useProperty } from "../../context/PropertyContext";
import { DEFAULT_RULES, checkPassword, passwordStrength } from "../../utils/password";

// Form pieces shared by the sign-in pages and My account: a labelled field
// whose error sits right under its box, a box that can carry an icon, and a
// password box with a show/hide button.

const svg = (children) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="fx-icon">
    {children}
  </svg>
);

export const FieldIcon = {
  Mail: () => svg(<><rect x="3" y="5.5" width="18" height="13" rx="1.5" /><path d="M3.5 6.5l8.5 6.5 8.5-6.5" /></>),
  Lock: () => svg(<><rect x="5" y="10.5" width="14" height="10" rx="1.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>),
  Alert: () => svg(<><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5.5M12 16.2v.3" /></>),
  Info: () => svg(<><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.3" /></>),
  Check: () => svg(<path d="M5 12.5l4.5 4.5L19 7.5" />),
  Dash: () => svg(<path d="M8 12h8" />),
  Eye: () => svg(<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>),
  EyeOff: () => svg(<><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /><path d="M4 4l16 16" /></>),
};

export const errorId = (id) => `${id}-error`;

// The text under a box saying what is wrong with it.
export function FieldError({ id, children }) {
  if (!children) return null;
  return (
    <p className="fx-error" id={id}>
      <FieldIcon.Alert />
      <span>{children}</span>
    </p>
  );
}

// label (+ something on the right of it, e.g. "Forgot password?"), the box,
// its error, and any help text below.
export function Field({ id, label, aside, error, children, help }) {
  return (
    <div className="g-field">
      {aside ? (
        <div className="fx-label-row">
          <label className="g-label" htmlFor={id}>{label}</label>
          {aside}
        </div>
      ) : (
        <label className="g-label" htmlFor={id}>{label}</label>
      )}
      {children}
      <FieldError id={errorId(id)}>{error}</FieldError>
      {help}
    </div>
  );
}

// Props for an input inside a Field: tie it to its error.
export function inputProps(id, error) {
  return { id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? errorId(id) : undefined };
}

// The bordered box: an optional icon, then the input.
export function Control({ icon, invalid, disabled, children }) {
  return (
    <div className={`fx-control${invalid ? " is-invalid" : ""}${disabled ? " is-disabled" : ""}`}>
      {icon}
      {children}
    </div>
  );
}

export function PasswordInput({ id, error, icon, describedBy, ...rest }) {
  const { t } = useTranslation("auth");
  const [visible, setVisible] = useState(false);
  const described = [error ? errorId(id) : null, describedBy].filter(Boolean).join(" ") || undefined;
  return (
    <Control icon={icon} invalid={Boolean(error)}>
      <input
        {...rest}
        id={id}
        type={visible ? "text" : "password"}
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
      />
      <button type="button" className="fx-eye" onClick={() => setVisible((v) => !v)} aria-pressed={visible} aria-label={visible ? t("common.hidePassword") : t("common.showPassword")}>
        {visible ? <FieldIcon.EyeOff /> : <FieldIcon.Eye />}
      </button>
    </Control>
  );
}

// The password rule the API publishes (falls back to the built-in copy).
export function usePasswordRules() {
  return useProperty().auth?.passwordRules || DEFAULT_RULES;
}

const METER_BARS = { weak: 1, medium: 2, strong: 4 };

// Four bars and a word; empty until something is typed.
export function PasswordMeter({ id, password }) {
  const { t } = useTranslation("auth");
  const strength = passwordStrength(password, usePasswordRules());
  return (
    <div className={`pw-meter${strength ? ` is-${strength}` : ""}`} id={id} data-strength={strength || "empty"}>
      <div className="pw-meter__bar" aria-hidden="true">
        {[1, 2, 3, 4].map((bar) => (
          <i key={bar} className={strength && bar <= METER_BARS[strength] ? "is-on" : undefined} />
        ))}
      </div>
      <div className="pw-meter__t">
        <span>{t("strength.label")}</span>
        <b aria-live="polite">{strength ? t(`strength.${strength}`) : ""}</b>
      </div>
    </div>
  );
}

// The rule as a checklist, ticking as the visitor types.
export function PasswordRules({ id, password }) {
  const { t } = useTranslation("auth");
  return (
    <ul className="pw-rules" id={id} data-testid="password-rules">
      {checkPassword(password, usePasswordRules()).map((rule) => (
        <li key={rule.id} className={rule.ok ? "ok" : undefined}>
          {rule.ok ? <FieldIcon.Check /> : <FieldIcon.Dash />}
          {t(`rules.${rule.id}`, { min: rule.min })}
          <span className="sr-only">{rule.ok ? t("rules.met") : t("rules.notMet")}</span>
        </li>
      ))}
    </ul>
  );
}
