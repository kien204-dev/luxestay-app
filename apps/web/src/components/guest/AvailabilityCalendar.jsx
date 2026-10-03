import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getRoomAvailability } from "../../services/roomService";
import { useAsyncData } from "../../utils/useAsyncData";
import { localDateString } from "../../utils/date";
import { addDays, monthLabel } from "../../utils/format";

const pad = (n) => String(n).padStart(2, "0");
const firstOfMonth = (year, month) => `${year}-${pad(month)}-01`;

function shiftMonth({ year, month }, delta) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function monthOf(dateStr) {
  const [year, month] = dateStr.split("-").map(Number);
  return { year, month };
}

// Monday-first weekday index (0..6) of a "YYYY-MM-DD" date.
function weekdayIndex(dateStr) {
  return (new Date(`${dateStr}T00:00:00Z`).getUTCDay() + 6) % 7;
}

// Every night from checkIn up to (not including) `day` must be free.
function nightsAreFree(taken, checkIn, day) {
  for (let night = checkIn; night < day; night = addDays(night, 1)) {
    if (taken.has(night)) return false;
  }
  return true;
}

// Month view of one room's free and taken nights. Clicking picks the stay:
// first click is check-in, the next (later) click is check-out.
export default function AvailabilityCalendar({ roomId, checkIn, checkOut, onSelect }) {
  const { t, i18n } = useTranslation("site");
  const fallbackToday = localDateString();
  const [view, setView] = useState(() => monthOf(checkIn || fallbackToday));

  const monthStart = firstOfMonth(view.year, view.month);
  const nextMonth = shiftMonth(view, 1);
  const monthEnd = firstOfMonth(nextMonth.year, nextMonth.month);

  const { data, loading, error } = useAsyncData(`availability:${roomId}:${monthStart}`, () =>
    getRoomAvailability(roomId, { from: monthStart, to: monthEnd })
  );

  // While another month is loading, `data` still holds the previous month.
  const current = data && data.from === monthStart ? data : null;
  const today = data?.today || fallbackToday;
  const taken = new Set(current?.unavailable || []);
  const choosingCheckOut = Boolean(checkIn) && !checkOut;

  const days = [];
  for (let day = monthStart; day < monthEnd; day = addDays(day, 1)) days.push(day);
  const leadingBlanks = weekdayIndex(monthStart);
  const weekdays = t("calendar.weekdays", { returnObjects: true });
  const currentMonth = monthOf(today);
  const canGoBack = monthStart > firstOfMonth(currentMonth.year, currentMonth.month);

  const handlePick = (day) => {
    if (choosingCheckOut && day > checkIn && nightsAreFree(taken, checkIn, day)) {
      onSelect({ checkIn, checkOut: day });
      return;
    }
    if (!taken.has(day)) onSelect({ checkIn: day, checkOut: "" });
  };

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button
          type="button"
          className="calendar-nav"
          aria-label={t("calendar.previous")}
          disabled={!canGoBack}
          onClick={() => setView((v) => shiftMonth(v, -1))}
        >
          ‹
        </button>
        <strong aria-live="polite">{monthLabel(view.year, view.month, i18n.language)}</strong>
        <button
          type="button"
          className="calendar-nav"
          aria-label={t("calendar.next")}
          onClick={() => setView((v) => shiftMonth(v, 1))}
        >
          ›
        </button>
      </div>

      <div className="calendar-grid" aria-busy={loading}>
        {(Array.isArray(weekdays) ? weekdays : []).map((name) => (
          <div key={name} className="calendar-weekday">{name}</div>
        ))}
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <div key={`blank-${i}`} />
        ))}

        {days.map((day) => {
          const isPast = day < today;
          const isTaken = taken.has(day);
          // A taken day can still be a check-out day: the stay ends that
          // morning, before the next guest's night begins.
          const canEndHere = choosingCheckOut && day > checkIn && nightsAreFree(taken, checkIn, day);
          const isSelected = day === checkIn || day === checkOut;
          const inRange = checkIn && checkOut && day > checkIn && day < checkOut;
          const disabled = !current || isPast || (isTaken && !canEndHere);

          const classes = ["calendar-day"];
          if (isPast) classes.push("is-past");
          else if (isSelected) classes.push("is-selected");
          else if (inRange) classes.push("is-in-range");
          else if (isTaken) classes.push("is-taken");
          if (isTaken && canEndHere) classes.push("is-checkout-ok");

          return (
            <button
              key={day}
              type="button"
              className={classes.join(" ")}
              disabled={disabled}
              data-date={day}
              data-state={isPast ? "past" : isTaken ? "taken" : "free"}
              aria-pressed={isSelected}
              aria-label={`${day}${isTaken ? ` – ${t("calendar.taken")}` : ""}`}
              onClick={() => handlePick(day)}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>

      {error && <p className="g-error" style={{ marginTop: 10 }}>{t("calendar.loadFailed")}</p>}
      {current && !current.bookable && (
        <p className="g-error" style={{ marginTop: 10 }}>{t("calendar.notBookable")}</p>
      )}

      <div className="calendar-legend">
        <span><i style={{ background: "var(--color-surface-muted)" }} />{t("calendar.free")}</span>
        <span><i style={{ background: "var(--color-danger-soft)" }} />{t("calendar.taken")}</span>
        <span><i style={{ background: "var(--g-navy)" }} />{t("calendar.selected")}</span>
      </div>
      <p className="guest-muted" style={{ fontSize: 12, margin: "10px 0 0" }}>
        {choosingCheckOut ? t("calendar.hintCheckOut") : t("calendar.hintCheckIn")}
      </p>
    </div>
  );
}
