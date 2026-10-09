import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { readThemeColors } from "../../../utils/themeColors";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The API labels buckets in English ("Jan", "Mon"); show them in the
// visitor's language.
function localLabel(label, locale) {
  const month = MONTHS.indexOf(label);
  if (month >= 0) return new Date(Date.UTC(2024, month, 1)).toLocaleDateString(locale, { month: "short", timeZone: "UTC" });
  const day = WEEKDAYS.indexOf(label);
  // 7 January 2024 was a Sunday.
  if (day >= 0) return new Date(Date.UTC(2024, 0, 7 + day)).toLocaleDateString(locale, { weekday: "short", timeZone: "UTC" });
  return label;
}

function shortMoney(value) {
  if (value >= 1000000) return `${value / 1000000}M`;
  if (value >= 1000) return `${value / 1000}K`;
  return value;
}

function Panel({ title, children }) {
  return (
    <section className="adm-panel adm-panel--padded">
      <h2 className="adm-panel-title">{title}</h2>
      {children}
    </section>
  );
}

// Revenue, bookings per bucket, top rooms and the status split, in the
// theme's colours.
export default function DashboardCharts({ analytics }) {
  const { t, i18n } = useTranslation("dashboard");
  const locale = i18n.language === "en" ? "en-US" : "vi-VN";
  const colors = useMemo(() => readThemeColors("dark"), []);
  const axis = { stroke: colors.muted, tick: { fill: colors.muted, fontSize: 12 } };
  const tooltip = {
    contentStyle: { backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 8, color: colors.text },
    labelStyle: { color: colors.accent },
  };
  const statusColor = { confirmed: colors.success, pending: colors.warning, completed: colors.info, cancelled: colors.danger };

  const revenue = analytics.revenueByMonth.map((point) => ({ ...point, label: localLabel(point.month, locale) }));
  const bookings = analytics.bookingsByMonth.map((point) => ({ ...point, label: localLabel(point.month, locale) }));
  const statuses = analytics.bookingsByStatus.map((item) => ({ name: t(`status.${item.name}`, { defaultValue: item.name }), key: item.name, value: item.value }));

  return (
    <div className="adm-stack" style={{ marginTop: 20 }}>
      <Panel title={t("revenueOverview")}>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={revenue}>
            <CartesianGrid stroke={colors.grid} />
            <XAxis dataKey="label" {...axis} />
            <YAxis width={60} {...axis} tickFormatter={shortMoney} />
            <Tooltip {...tooltip} formatter={(value) => [`${Number(value).toLocaleString(locale)} ₫`, t("revenueLabel")]} />
            <Line type="monotone" dataKey="revenue" stroke={colors.accent} strokeWidth={3} dot={false} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <div className="adm-split">
        <Panel title={t("bookingsByMonth")}>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={bookings}>
              <CartesianGrid stroke={colors.grid} />
              <XAxis dataKey="label" {...axis} />
              <YAxis allowDecimals={false} {...axis} />
              <Tooltip {...tooltip} formatter={(value) => [value, t("bookingsLabel")]} />
              <Bar dataKey="bookings" fill={colors.info} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title={t("bookingStatus.title")}>
          {statuses.length === 0 ? (
            <p className="adm-empty">{t("bookingStatus.empty")}</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={statuses} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {statuses.map((entry) => (
                      <Cell key={entry.key} fill={statusColor[entry.key] || colors.muted} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltip} />
                </PieChart>
              </ResponsiveContainer>
              {statuses.map((item) => (
                <div key={item.key} className="adm-card-row" style={{ marginTop: 6 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <span className="adm-dot" style={{ color: statusColor[item.key] || colors.muted }} />
                    {item.name}
                  </span>
                  <span>{item.value}</span>
                </div>
              ))}
            </>
          )}
        </Panel>
      </div>

      <Panel title={t("topBookedRooms.title")}>
        {analytics.topRooms.length === 0 ? (
          <p className="adm-empty">{t("topBookedRooms.empty")}</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={analytics.topRooms} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid stroke={colors.grid} />
              <XAxis type="number" allowDecimals={false} {...axis} />
              <YAxis type="category" dataKey="room_name" width={150} {...axis} />
              <Tooltip {...tooltip} formatter={(value) => [value, t("bookingsLabel")]} />
              <Bar dataKey="booking_count" fill={colors.success} radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </div>
  );
}
