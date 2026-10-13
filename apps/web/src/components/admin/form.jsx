import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import AxIcon from "./AxIcon";

// Pieces of the admin's long forms (room, property): a section with its
// title and explanation on the left, a number stepper, and the bar pinned
// at the bottom that counts unsaved changes and errors.

export function FormSection({ id, title, children, description }) {
  return (
    <section className="ax-fsec" aria-labelledby={`${id}-t`}>
      <div className="ax-fsec__k">
        <h2 id={`${id}-t`}>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      <div className="ax-fsec__v">{children}</div>
    </section>
  );
}

export function Stepper({ id, label, value, min = 0, max = 999, onChange, help }) {
  const { t } = useTranslation("admin");
  const number = Number(value) || 0;
  return (
    <div className="ax-stepfield">
      <span className="g-label" id={`${id}-label`}>{label}</span>
      <div className="ax-stepper2" role="group" aria-labelledby={`${id}-label`}>
        <button type="button" className="ax-iconbtn ax-iconbtn--round" aria-label={t("stepper.less", { label })} disabled={number <= min} onClick={() => onChange(Math.max(min, number - 1))}>
          <AxIcon name="minus" small />
        </button>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={value}
          aria-labelledby={`${id}-label`}
          onChange={(event) => onChange(event.target.value === "" ? "" : Math.min(max, Math.max(min, Number(event.target.value))))}
        />
        <button type="button" className="ax-iconbtn ax-iconbtn--round" aria-label={t("stepper.more", { label })} disabled={number >= max} onClick={() => onChange(Math.min(max, number + 1))}>
          <AxIcon name="plus" small />
        </button>
      </div>
      {help}
    </div>
  );
}

// Warns before leaving the page with work not saved.
export function useLeaveWarning(active) {
  useEffect(() => {
    if (!active) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);
}

export function SaveBar({ changes, errors, saving, onCancel, cancelLabel, saveLabel, extra, testId }) {
  const { t } = useTranslation("admin");
  const parts = [];
  if (changes) parts.push(t("savebar.changes", { count: changes }));
  if (errors) parts.push(t("savebar.errors", { count: errors }));
  return (
    <div className="ax-savebar" data-testid={testId}>
      <p className={`ax-savebar__s${changes || errors ? " is-dirty" : ""}`} role="status">
        {parts.length ? parts.join(" · ") : t("savebar.clean")}
      </p>
      {extra}
      <button type="button" className="g-btn ax-btn-ghost" onClick={onCancel} disabled={saving}>
        {cancelLabel}
      </button>
      <button type="submit" className="g-btn g-btn--primary" disabled={saving || !changes} data-testid={testId ? `${testId}-save` : undefined}>
        {saving ? t("saving") : saveLabel}
      </button>
    </div>
  );
}
