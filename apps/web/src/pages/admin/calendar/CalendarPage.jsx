import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Badge, Modal, PageHeader } from "../../../components/admin/ui";
import { getBookingCalendar } from "../../../services/bookingService";
import { getRoomLocations, getRooms } from "../../../services/roomService";
import { apiErrorText } from "../../../utils/apiError";
import { formatDate, formatMoney, monthLabel } from "../../../utils/format";
import Icon from "../../../utils/icon";
import { useAsyncData } from "../../../utils/useAsyncData";
import { STATUS_TONE } from "../orders/orderLabels";
import MonthGrid from "./MonthGrid";

const STATUSES = ["confirmed", "pending", "completed", "cancelled"];

// Admin: one room's bookings, a month at a time. Pick a location, then a
// room in it.
export default function CalendarPage() {
  const { t, i18n } = useTranslation("calendar");
  const lang = i18n.language;
  const now = new Date();
  const [month, setMonth] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [locationInput, setLocationInput] = useState("");
  const [location, setLocation] = useState("");
  const [roomChoice, setRoomChoice] = useState("");
  const [openBookingId, setOpenBookingId] = useState(null);

  const locations = useAsyncData("calendar-locations", getRoomLocations).data || [];
  const roomsQuery = useAsyncData(location ? `calendar-rooms:${location}` : null, () => getRooms({ location, limit: 100 }));
  const rooms = roomsQuery.data?.data || (Array.isArray(roomsQuery.data) ? roomsQuery.data : []);
  const roomId = rooms.some((room) => String(room.id) === String(roomChoice)) ? roomChoice : rooms[0]?.id ?? "";

  const calendar = useAsyncData(roomId ? `calendar:${roomId}:${month.year}-${month.month}` : null, () =>
    getBookingCalendar({ roomId, year: month.year, month: month.month }).then((res) => res.data)
  );
  const booking = openBookingId && calendar.data?.bookings?.find((b) => b.id === openBookingId);

  // Choosing from the list (or pressing Enter) loads the rooms there.
  const commitLocation = (value) => {
    setLocation(value.trim());
    setRoomChoice("");
  };
  const step = (delta) =>
    setMonth(({ year, month: m }) => {
      const next = m + delta;
      return next < 1 ? { year: year - 1, month: 12 } : next > 12 ? { year: year + 1, month: 1 } : { year, month: next };
    });

  return (
    <div data-testid="calendar-page">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="adm-panel adm-panel--padded" style={{ marginBottom: 20 }}>
        <div className="adm-form-grid">
          <form
            className="adm-field"
            onSubmit={(event) => {
              event.preventDefault();
              commitLocation(locationInput);
            }}
          >
            <label className="adm-label" htmlFor="calendar-location">{t("location")}</label>
            <input
              id="calendar-location"
              className="adm-input"
              list="calendar-location-options"
              value={locationInput}
              placeholder={t("locationPlaceholder")}
              onChange={(event) => {
                setLocationInput(event.target.value);
                if (locations.includes(event.target.value)) commitLocation(event.target.value);
              }}
              onBlur={() => commitLocation(locationInput)}
            />
            <datalist id="calendar-location-options">
              {locations.map((item) => <option key={item} value={item} />)}
            </datalist>
          </form>
          <div className="adm-field">
            <label className="adm-label" htmlFor="calendar-room">{t("room")}</label>
            <select id="calendar-room" className="adm-select" value={roomId} onChange={(e) => setRoomChoice(e.target.value)} disabled={!location || roomsQuery.loading || rooms.length === 0}>
              {!location ? (
                <option value="">{t("pickLocationFirst")}</option>
              ) : roomsQuery.loading ? (
                <option value="">{t("loadingRooms")}</option>
              ) : rooms.length === 0 ? (
                <option value="">{t("noRooms")}</option>
              ) : (
                rooms.map((room) => <option key={room.id} value={room.id}>{room.room_name} — {room.room_type}</option>)
              )}
            </select>
          </div>
        </div>
      </div>

      {!roomId ? (
        <p className="adm-panel adm-empty">{t("pickRoom")}</p>
      ) : (
        <div className="adm-panel adm-panel--padded">
          <div className="adm-page-header" style={{ marginBottom: 16, alignItems: "center" }}>
            <div>
              <h2 className="adm-panel-title" style={{ margin: 0 }}>{calendar.data?.room?.room_name || "…"}</h2>
              <p className="adm-hint" style={{ margin: "4px 0 0" }}>{calendar.data?.room?.location || ""}</p>
            </div>
            <div className="adm-actions">
              <button type="button" className="adm-icon-btn" onClick={() => step(-1)} aria-label={t("previousMonth")}><Icon.ChevronLeft /></button>
              <strong style={{ minWidth: 150, textAlign: "center", color: "var(--color-text-primary)" }}>{monthLabel(month.year, month.month, lang)}</strong>
              <button type="button" className="adm-icon-btn" onClick={() => step(1)} aria-label={t("nextMonth")}><Icon.ChevronRight /></button>
            </div>
          </div>

          <Alert>{calendar.error ? apiErrorText(calendar.error, "admin:loadFailed") : ""}</Alert>

          <div className="adm-cal-legend">
            {STATUSES.map((status) => (
              <span key={status}><span className={`adm-dot`} style={{ color: `var(--color-${{ confirmed: "success", pending: "warning", completed: "info", cancelled: "danger" }[status]})` }} />{t(`status.${status}`)}</span>
            ))}
          </div>

          <MonthGrid year={month.year} month={month.month} days={calendar.data?.days} loading={calendar.loading} onPick={setOpenBookingId} />
        </div>
      )}

      {booking && (
        <Modal
          title={t("detail.title")}
          onClose={() => setOpenBookingId(null)}
          labelledBy="calendar-detail-title"
          footer={<button type="button" className="adm-btn adm-btn--muted" onClick={() => setOpenBookingId(null)}>{t("admin:close")}</button>}
        >
          <Badge tone={STATUS_TONE[booking.status]}>{t(`status.${booking.status}`)}</Badge>
          <div className="adm-detail-row"><span>{t("detail.guest")}</span><span>{booking.user_name}</span></div>
          <div className="adm-detail-row"><span>{t("detail.email")}</span><span>{booking.user_email}</span></div>
          <div className="adm-detail-row"><span>{t("detail.dates")}</span><span>{formatDate(String(booking.check_in).slice(0, 10), lang)} → {formatDate(String(booking.check_out).slice(0, 10), lang)}</span></div>
          <div className="adm-detail-row"><span>{t("detail.guests")}</span><span>{booking.guests}</span></div>
          <div className="adm-detail-row"><span>{t("detail.total")}</span><span>{formatMoney(booking.total_price, lang)}</span></div>
        </Modal>
      )}
    </div>
  );
}
