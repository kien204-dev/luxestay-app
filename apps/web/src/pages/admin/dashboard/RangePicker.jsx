import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDismiss } from "../../../layout/admin/useDismiss";
import { addDays, nightsBetween } from "../../../utils/format";
import { rangeText } from "../../../utils/adminFormat";

export const MAX_DAYS = 366;

function presets(today) {
  const [y, m] = today.split("-").map(Number);
  const pad = (v) => String(v).padStart(2, "0");
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const monthStart = `${y}-${pad(m)}-01`;
  const lastMonthEnd = addDays(monthStart, -1);
  return [
    { key: "today", from: today, to: today },
    { key: "thisWeek", from: addDays(today, -weekday), to: today },
    { key: "thisMonth", from: monthStart, to: today },
    { key: "lastMonth", from: `${lastMonthEnd.slice(0, 7)}-01`, to: lastMonthEnd },
    { key: "thisYear", from: `${y}-01-01`, to: today },
  ];
}

// The "custom" window: a few ready ranges, or any two dates up to today and
// at most a year apart. What it will be compared with is shown before it is
// applied.
export default function RangePicker({ today, initial, onApply, onCancel, anchorRef }) {
  const { t, i18n } = useTranslation("dashboard");
  const lang = i18n.language;
  const id = useId();
  const box = useRef(null);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  useDismiss(box, true, onCancel, anchorRef);

  const days = from && to ? nightsBetween(from, to) + 1 : 0;
  const error = !from || !to
    ? t("overview.range.missing")
    : from > to
      ? t("overview.range.order")
      : to > today
        ? t("overview.range.future")
        : days > MAX_DAYS
          ? t("overview.range.tooLong", { max: MAX_DAYS })
          : "";
  const prevTo = from ? addDays(from, -1) : "";
  const prevFrom = from ? addDays(from, -days) : "";

  return (
    <div ref={box} className="ax-card ax-range" role="dialog" aria-label={t("overview.range.title")} data-testid="range-picker">
      <div className="ax-chipset" role="group" aria-label={t("overview.range.presets")}>
        {presets(today).map((preset) => (
          <button
            key={preset.key}
            type="button"
            className="ax-chip ax-chip--sm"
            aria-pressed={preset.from === from && preset.to === to}
            onClick={() => {
              setFrom(preset.from);
              setTo(preset.to);
            }}
          >
            {t(`overview.range.preset.${preset.key}`)}
          </button>
        ))}
      </div>
      <div className="ax-range__row">
        <label className="fx-field">
          <span className="fx-label-row">{t("overview.range.from")}</span>
          <span className="fx-control">
            <input id={`${id}-from`} type="date" value={from} max={today} onChange={(event) => setFrom(event.target.value)} autoFocus />
          </span>
        </label>
        <label className="fx-field">
          <span className="fx-label-row">{t("overview.range.to")}</span>
          <span className="fx-control">
            <input id={`${id}-to`} type="date" value={to} max={today} onChange={(event) => setTo(event.target.value)} />
          </span>
        </label>
      </div>
      {error ? (
        <p className="fx-error" role="alert">{error}</p>
      ) : (
        <p className="ax-muted ax-range__sum">
          {t("overview.range.summary", { range: rangeText(from, to, lang), count: days, prev: rangeText(prevFrom, prevTo, lang) })}
        </p>
      )}
      <div className="ax-range__foot">
        <button type="button" className="g-btn g-btn--outline g-btn--small" onClick={onCancel}>
          {t("overview.range.cancel")}
        </button>
        <button type="button" className="g-btn g-btn--primary g-btn--small" disabled={Boolean(error)} onClick={() => onApply({ from, to })} data-testid="range-apply">
          {t("overview.range.apply")}
        </button>
      </div>
    </div>
  );
}
