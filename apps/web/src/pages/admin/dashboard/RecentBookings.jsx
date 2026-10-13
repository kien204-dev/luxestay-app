import { useTranslation } from "react-i18next";
import { Badge } from "../../../components/admin/ui";
import { formatDate, formatMoney } from "../../../utils/format";
import { STATUS_TONE } from "../orders/orderLabels";
import { bookingCode } from "../../../utils/bookingCode";

// The last five bookings made.
export default function RecentBookings({ bookings }) {
  const { t, i18n } = useTranslation("dashboard");
  const lang = i18n.language;

  return (
    <section className="adm-panel adm-panel--padded" style={{ marginTop: 20 }}>
      <h2 className="adm-panel-title">{t("recentBookings.title")}</h2>
      {bookings.length === 0 ? (
        <p className="adm-empty">{t("recentBookings.empty")}</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                {["bookingId", "guest", "room", "checkIn", "checkOut", "status", "amount"].map((column) => (
                  <th key={column}>{t(`recentBookings.columns.${column}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td style={{ color: "var(--color-gold-400)", fontWeight: 600 }}>{bookingCode(booking.id)}</td>
                  <td style={{ color: "var(--color-text-primary)" }}>{booking.user_name || "—"}</td>
                  <td>{booking.room_name || "—"}</td>
                  <td>{formatDate(String(booking.check_in).slice(0, 10), lang)}</td>
                  <td>{formatDate(String(booking.check_out).slice(0, 10), lang)}</td>
                  <td>
                    <Badge tone={STATUS_TONE[booking.status] || "neutral"}>{t(`status.${booking.status}`, { defaultValue: booking.status })}</Badge>
                  </td>
                  <td className="is-strong" style={{ color: "var(--color-text-primary)" }}>{formatMoney(booking.total_price, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
