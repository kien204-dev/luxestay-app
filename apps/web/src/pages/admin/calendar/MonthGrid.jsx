import { useTranslation } from "react-i18next";
import { localDateString } from "../../../utils/date";

const pad = (n) => String(n).padStart(2, "0");

// One month, Monday first. `days` maps "YYYY-MM-DD" to { status, bookingId }.
export default function MonthGrid({ year, month, days = {}, loading, onPick }) {
  const { t, i18n } = useTranslation("calendar");
  const locale = i18n.language === "en" ? "en-US" : "vi-VN";
  const today = localDateString();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const blanks = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  // 1 January 2024 was a Monday.
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" }));

  return (
    <div>
      <div className="adm-cal-grid" style={{ marginBottom: 6 }}>
        {weekdays.map((day) => (
          <div key={day} className="adm-cal-weekday">{day}</div>
        ))}
      </div>
      <div className="adm-cal-grid" data-testid="calendar-grid">
        {loading
          ? Array.from({ length: 35 }, (_, i) => <div key={i} className="luxe-skeleton" style={{ aspectRatio: "1", borderRadius: 8 }} />)
          : [...Array(blanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)].map((day, index) => {
              if (day === null) return <div key={`blank-${index}`} />;
              const key = `${year}-${pad(month)}-${pad(day)}`;
              const info = days[key];
              const classes = ["adm-cal-day", key === today && "is-today", info && "has-booking", info && `is-${info.status}`].filter(Boolean).join(" ");
              return (
                <button
                  key={key}
                  type="button"
                  className={classes}
                  disabled={!info}
                  onClick={() => info && onPick(info.bookingId)}
                  aria-label={info ? t("dayWithBooking", { day, status: t(`status.${info.status}`) }) : String(day)}
                >
                  {day}
                </button>
              );
            })}
      </div>
    </div>
  );
}
