import { useTranslation } from "react-i18next";
import { getStatusFilterOptions } from "./helpers";

// Status and date filters above the list. Reports changes as a partial
// { statusFilter, fromDate, toDate } object.
export default function BookingFilters({ statusFilter, fromDate, toDate, onChange }) {
  const { t } = useTranslation("myBookings");
  const statusFilterOptions = getStatusFilterOptions(t);

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        alignItems: "flex-end",
        marginBottom: 24,
        background: "var(--color-surface-light)",
        border: "1px solid var(--color-line-light)",
        borderRadius: 10,
        padding: 16,
      }}
    >
      <div>
        <label
          style={{
            display: "block",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--color-ink-muted)",
            marginBottom: 6,
          }}
        >
          {t("myBookings:filters.status")}
        </label>
        <select
          value={statusFilter}
          onChange={(e) => onChange({ statusFilter: e.target.value })}
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid var(--color-line-light)",
            fontSize: 13,
            minWidth: 160,
          }}
        >
          {statusFilterOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label
          style={{
            display: "block",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--color-ink-muted)",
            marginBottom: 6,
          }}
        >
          {t("myBookings:filters.fromDate")}
        </label>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => onChange({ fromDate: e.target.value })}
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid var(--color-line-light)",
            fontSize: 13,
          }}
        />
      </div>
      <div>
        <label
          style={{
            display: "block",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--color-ink-muted)",
            marginBottom: 6,
          }}
        >
          {t("myBookings:filters.toDate")}
        </label>
        <input
          type="date"
          value={toDate}
          onChange={(e) => onChange({ toDate: e.target.value })}
          style={{
            padding: "8px 10px",
            borderRadius: 6,
            border: "1px solid var(--color-line-light)",
            fontSize: 13,
          }}
        />
      </div>
      {(statusFilter || fromDate || toDate) && (
        <button
          onClick={() => onChange({ statusFilter: "", fromDate: "", toDate: "" })}
          style={{
            padding: "8px 14px",
            background: "transparent",
            border: "1px solid var(--color-line-light)",
            borderRadius: 6,
            color: "var(--color-ink-muted)",
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          {t("myBookings:filters.clear")}
        </button>
      )}
    </div>
  );
}
