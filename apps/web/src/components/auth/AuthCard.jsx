import { useState } from "react";
import { useTranslation } from "react-i18next";

// The card the sign-in pages sit in, inside the guest site's header/footer.
export default function AuthCard({ title, subtitle, children, footer, testId }) {
  return (
    <div className="auth-wrap">
      <div className="auth-card" data-testid={testId}>
        <h1>{title}</h1>
        {subtitle && <p className="auth-sub">{subtitle}</p>}
        {children}
        {footer && <p className="auth-foot">{footer}</p>}
      </div>
    </div>
  );
}

export function AuthField({ id, label, error, children }) {
  return (
    <div className="g-field">
      <label className="g-label" htmlFor={id}>{label}</label>
      {children}
      {error && <p className="g-error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}

// A password box with a show/hide toggle.
export function PasswordInput({ id, value, onChange, autoComplete, invalid, disabled }) {
  const { t } = useTranslation("auth");
  const [visible, setVisible] = useState(false);
  return (
    <div className="auth-password">
      <input
        id={id}
        className="g-input"
        type={visible ? "text" : "password"}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        disabled={disabled}
      />
      <button type="button" onClick={() => setVisible((v) => !v)} aria-pressed={visible}>
        {visible ? t("common.hide") : t("common.show")}
      </button>
    </div>
  );
}
