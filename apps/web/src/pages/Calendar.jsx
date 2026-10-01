import { useCallback, useEffect, useState } from "react";
import { getRoomLocations, getRooms } from "../services/roomService";
import { getBookingCalendar } from "../services/bookingService";
import LocationAutocomplete from "../components/LocationAutocomplete";
import Icon from "../utils/icon";

// Same palette Orders.jsx already uses for booking status — kept identical
// here so a color means the same thing everywhere in the admin UI.
const STATUS_STYLE = {
  confirmed: { color: "var(--color-success)", bg: "rgba(103,232,180,0.18)" },
  pending: { color: "var(--color-warning)", bg: "rgba(251,191,36,0.18)" },
  cancelled: { color: "var(--color-danger)", bg: "rgba(248,113,113,0.18)" },
  completed: { color: "var(--color-info)", bg: "rgba(125,211,252,0.18)" },
};

const STATUS_LABEL = {
  confirmed: "Đã xác nhận",
  pending: "Chờ xác nhận",
  cancelled: "Đã hủy",
  completed: "Hoàn tất",
};

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const MONTH_LABELS = [
  "Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6",
  "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12",
];

const PANEL_STYLE = {
  background: "var(--color-navy-800)",
  border: "1px solid var(--color-border-soft)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-card)",
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function dateKey(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function formatMoney(value) {
  return (Number(value) || 0).toLocaleString("vi-VN") + " đ";
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("vi-VN");
}

// Monday-first weekday index (0=Mon..6=Sun) for the 1st of the month.
function leadingBlankCount(year, month) {
  const jsDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=Sun..6=Sat
  return (jsDay + 6) % 7;
}

export default function Calendar() {
  const [locations, setLocations] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState("");

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [calendarData, setCalendarData] = useState(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useState("");
  const [selectedDayKey, setSelectedDayKey] = useState(null);

  useEffect(() => {
    getRoomLocations()
      .then((list) => setLocations(Array.isArray(list) ? list : []))
      .catch(() => setLocations([]));
  }, []);

  const loadRooms = useCallback((location) => {
    if (!location.trim()) {
      setRooms([]);
      setSelectedRoomId("");
      return;
    }
    setRoomsLoading(true);
    getRooms({ location, limit: 100 })
      .then((result) => {
        const list = Array.isArray(result) ? result : result.data || [];
        setRooms(list);
        setSelectedRoomId((prev) =>
          list.some((r) => String(r.id) === String(prev)) ? prev : list[0]?.id ?? ""
        );
      })
      .catch(() => {
        setRooms([]);
        setSelectedRoomId("");
      })
      .finally(() => setRoomsLoading(false));
  }, []);

  // Debounced: typing quickly in the location field shouldn't fire a room
  // lookup per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => loadRooms(selectedLocation), 400);
    return () => clearTimeout(timer);
  }, [selectedLocation, loadRooms]);

  const loadCalendar = useCallback(() => {
    if (!selectedRoomId) {
      setCalendarData(null);
      return;
    }
    setCalendarLoading(true);
    setCalendarError("");
    setSelectedDayKey(null);
    return getBookingCalendar({ roomId: selectedRoomId, year, month })
      .then((res) => setCalendarData(res.data))
      .catch((err) => {
        setCalendarData(null);
        setCalendarError(err.response?.data?.message || "Không tải được dữ liệu lịch");
      })
      .finally(() => setCalendarLoading(false));
  }, [selectedRoomId, year, month]);

  useEffect(() => {
    // Only one room + one month is ever fetched at a time — never the whole
    // 390-room dataset — and this is a real network call, not a synchronous
    // state derivation, so defer it a tick past the effect's own body.
    Promise.resolve().then(() => loadCalendar());
  }, [loadCalendar]);

  const goToMonth = (delta) => {
    let nextMonth = month + delta;
    let nextYear = year;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setMonth(nextMonth);
    setYear(nextYear);
  };

  const daysInMonth = calendarData?.daysInMonth ?? new Date(year, month, 0).getDate();
  const blanks = leadingBlankCount(year, month);
  const cells = [...Array(blanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const selectedDayInfo = selectedDayKey ? calendarData?.days?.[selectedDayKey] : null;
  const selectedBooking =
    selectedDayInfo && calendarData
      ? calendarData.bookings.find((b) => b.id === selectedDayInfo.bookingId)
      : null;

  return (
    <div>
      <header style={{ marginBottom: 28 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-serif)",
            fontSize: 28,
            fontWeight: 700,
            color: "var(--color-text-primary)",
          }}
        >
          Lịch đặt phòng
        </h1>
        <p style={{ color: "var(--color-text-muted)", marginTop: 8 }}>
          Chọn địa điểm rồi chọn 1 phòng cụ thể để xem lịch đặt phòng theo tháng.
        </p>
      </header>

      <div style={{ ...PANEL_STYLE, padding: 20, marginBottom: 24 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          <div style={{ flex: "1 1 260px", minWidth: 220 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--color-text-muted)",
                marginBottom: 8,
                fontWeight: 700,
              }}
            >
              Địa điểm
            </label>
            <div
              style={{
                background: "var(--color-navy-900)",
                border: "1px solid var(--color-border-soft)",
                borderRadius: 8,
                padding: "9px 12px",
              }}
            >
              <LocationAutocomplete
                value={selectedLocation}
                onChange={setSelectedLocation}
                options={locations}
                placeholder="Nhập địa điểm để tìm phòng..."
                variant="dark"
              />
            </div>
          </div>

          <div style={{ flex: "1 1 260px", minWidth: 220 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--color-text-muted)",
                marginBottom: 8,
                fontWeight: 700,
              }}
            >
              Phòng
            </label>
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              disabled={!selectedLocation.trim() || roomsLoading}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid var(--color-border-soft)",
                background: "var(--color-navy-900)",
                color: "var(--color-text-primary)",
                fontSize: 13,
              }}
            >
              {!selectedLocation.trim() ? (
                <option value="">Chọn địa điểm trước</option>
              ) : roomsLoading ? (
                <option value="">Đang tải danh sách phòng...</option>
              ) : rooms.length === 0 ? (
                <option value="">Không có phòng nào ở địa điểm này</option>
              ) : (
                rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.room_name} — {r.room_type}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      {!selectedRoomId ? (
        <div style={{ ...PANEL_STYLE, padding: "56px 22px", textAlign: "center" }}>
          <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>
            Chọn một phòng ở trên để xem lịch đặt phòng.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24 }}>
          <div style={{ ...PANEL_STYLE, padding: 22 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 12,
                marginBottom: 20,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: 18, color: "var(--color-text-primary)" }}>
                  {calendarData?.room?.room_name || "..."}
                </h2>
                <p style={{ margin: "4px 0 0", color: "var(--color-text-muted)", fontSize: 13 }}>
                  {calendarData?.room?.location || ""}
                </p>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button
                  onClick={() => goToMonth(-1)}
                  style={navButtonStyle}
                  aria-label="Tháng trước"
                >
                  <Icon.ChevronLeft />
                </button>
                <span style={{ color: "var(--color-text-primary)", fontWeight: 700, minWidth: 120, textAlign: "center" }}>
                  {MONTH_LABELS[month - 1]} {year}
                </span>
                <button
                  onClick={() => goToMonth(1)}
                  style={navButtonStyle}
                  aria-label="Tháng sau"
                >
                  <Icon.ChevronRight />
                </button>
              </div>
            </div>

            {calendarError && (
              <div style={{ padding: "12px 0", color: "var(--color-danger)", fontSize: 14 }}>
                {calendarError}
              </div>
            )}

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 16,
                marginBottom: 18,
                fontSize: 12,
              }}
            >
              {Object.entries(STATUS_LABEL).map(([status, label]) => (
                <div key={status} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 3,
                      background: STATUS_STYLE[status].color,
                      display: "inline-block",
                    }}
                  />
                  <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  style={{
                    textAlign: "center",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "var(--color-text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    padding: "6px 0",
                  }}
                >
                  {d}
                </div>
              ))}
            </div>

            {calendarLoading ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                {Array.from({ length: 35 }).map((_, i) => (
                  <div key={i} className="luxe-skeleton" style={{ aspectRatio: "1", borderRadius: 8 }} />
                ))}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                {cells.map((day, i) => {
                  if (day === null) {
                    return <div key={`blank-${i}`} />;
                  }

                  const key = dateKey(year, month, day);
                  const info = calendarData?.days?.[key];
                  const style = info ? STATUS_STYLE[info.status] : null;
                  const isToday =
                    year === today.getFullYear() &&
                    month === today.getMonth() + 1 &&
                    day === today.getDate();

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => info && setSelectedDayKey(key)}
                      disabled={!info}
                      style={{
                        aspectRatio: "1",
                        borderRadius: 8,
                        border: isToday
                          ? "1px solid var(--color-gold-500)"
                          : "1px solid var(--color-border-soft)",
                        background: style ? style.bg : "var(--color-navy-900)",
                        color: style ? style.color : "var(--color-text-secondary)",
                        fontWeight: style ? 700 : 500,
                        fontSize: 13,
                        cursor: info ? "pointer" : "default",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedBooking && (
        <div
          onClick={() => setSelectedDayKey(null)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            zIndex: 3500,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              ...PANEL_STYLE,
              width: "100%",
              maxWidth: 420,
              padding: 24,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18, color: "var(--color-text-primary)" }}>
                Chi tiết đặt phòng
              </h3>
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: 20,
                  fontSize: 11,
                  fontWeight: 700,
                  color: STATUS_STYLE[selectedBooking.status]?.color,
                  background: STATUS_STYLE[selectedBooking.status]?.bg,
                }}
              >
                {STATUS_LABEL[selectedBooking.status] || selectedBooking.status}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
              <DetailRow label="Khách" value={selectedBooking.user_name} />
              <DetailRow label="Email" value={selectedBooking.user_email} />
              <DetailRow
                label="Ngày"
                value={`${formatDate(selectedBooking.check_in)} → ${formatDate(selectedBooking.check_out)}`}
              />
              <DetailRow label="Số khách" value={`${selectedBooking.guests} khách`} />
              <DetailRow label="Tổng tiền" value={formatMoney(selectedBooking.total_price)} />
            </div>

            <button
              onClick={() => setSelectedDayKey(null)}
              style={{
                marginTop: 20,
                width: "100%",
                padding: "10px",
                borderRadius: 8,
                border: "1px solid var(--color-border-soft)",
                background: "transparent",
                color: "var(--color-text-secondary)",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "var(--color-text-muted)" }}>{label}</span>
      <span style={{ color: "var(--color-text-primary)", fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

const navButtonStyle = {
  width: 32,
  height: 32,
  borderRadius: 8,
  border: "1px solid var(--color-border-soft)",
  background: "var(--color-navy-900)",
  color: "var(--color-text-secondary)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
