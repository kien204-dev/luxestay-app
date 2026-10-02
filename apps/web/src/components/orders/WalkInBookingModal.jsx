import { useState } from "react";
import { createBooking } from "../../services/bookingService";
import { getRooms } from "../../services/roomService";
import { useAsyncData } from "../../utils/useAsyncData";
import { localDateString } from "../../utils/date";

const OVERLAY = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.65)",
  zIndex: 3000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};
const PANEL = {
  background: "var(--color-navy-800)",
  border: "1px solid var(--color-border-soft)",
  borderRadius: "var(--radius-lg)",
  padding: 24,
  width: "100%",
  maxWidth: 560,
  maxHeight: "92vh",
  overflowY: "auto",
};
const LABEL = { display: "block", fontSize: 12, fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 6 };
const INPUT = {
  width: "100%",
  boxSizing: "border-box",
  background: "var(--color-navy-950)",
  color: "var(--color-text-primary)",
  border: "1px solid var(--color-border-soft)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
};

const EMPTY = {
  roomId: "",
  checkIn: "",
  checkOut: "",
  guests: 1,
  guestName: "",
  guestPhone: "",
  guestEmail: "",
  paid: false,
};

// Admin enters a booking for a guest at the desk or on the phone. It is
// confirmed straight away; "paid" records money already taken.
export default function WalkInBookingModal({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [roomSearch, setRoomSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const { data: roomResult, loading: roomsLoading } = useAsyncData(`walk-in-rooms:${roomSearch}`, () =>
    getRooms({
      bookable: true,
      limit: 100,
      sortBy: "name",
      sortOrder: "asc",
      ...(roomSearch.trim() ? { q: roomSearch.trim() } : {}),
      // Once dates are chosen, only offer rooms that are free for them.
      ...(form.checkIn && form.checkOut && form.checkOut > form.checkIn
        ? { checkIn: form.checkIn, checkOut: form.checkOut }
        : {}),
    })
  );
  const rooms = roomResult?.data || [];
  const today = localDateString();
  const set = (changes) => setForm((current) => ({ ...current, ...changes }));

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.roomId) return setError("Vui lòng chọn phòng");
    if (!form.checkIn || !form.checkOut || form.checkOut <= form.checkIn) {
      return setError("Vui lòng chọn ngày nhận và trả phòng hợp lệ");
    }
    if (!form.guestName.trim()) return setError("Vui lòng nhập tên khách");

    setSubmitting(true);
    setError("");
    try {
      const res = await createBooking({
        room_id: Number(form.roomId),
        check_in: form.checkIn,
        check_out: form.checkOut,
        guests: Number(form.guests) || 1,
        guest_name: form.guestName,
        guest_phone: form.guestPhone,
        guest_email: form.guestEmail,
        paid: form.paid,
      });
      onCreated(res.data.booking);
    } catch (err) {
      setError(err.response?.data?.message || "Không tạo được đặt phòng");
    } finally {
      setSubmitting(false);
    }
    return undefined;
  };

  return (
    <div style={OVERLAY} onClick={() => !submitting && onClose()}>
      <form
        style={PANEL}
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        aria-label="Tạo đặt phòng tại quầy"
        noValidate
      >
        <h2 style={{ margin: "0 0 4px", fontSize: 20, color: "var(--color-text-primary)" }}>
          Tạo đặt phòng tại quầy
        </h2>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "var(--color-text-muted)" }}>
          Đặt hộ khách trực tiếp hoặc qua điện thoại. Đơn được xác nhận ngay, không cần chờ thanh toán.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div>
            <label style={LABEL} htmlFor="walkin-check-in">Nhận phòng</label>
            <input
              id="walkin-check-in"
              type="date"
              style={INPUT}
              min={today}
              value={form.checkIn}
              onChange={(e) => set({ checkIn: e.target.value, roomId: "" })}
            />
          </div>
          <div>
            <label style={LABEL} htmlFor="walkin-check-out">Trả phòng</label>
            <input
              id="walkin-check-out"
              type="date"
              style={INPUT}
              min={form.checkIn || today}
              value={form.checkOut}
              onChange={(e) => set({ checkOut: e.target.value, roomId: "" })}
            />
          </div>

          <div style={{ gridColumn: "1 / -1" }}>
            <label style={LABEL} htmlFor="walkin-room-search">Phòng</label>
            <input
              id="walkin-room-search"
              type="search"
              style={{ ...INPUT, marginBottom: 8 }}
              placeholder="Tìm theo tên hoặc loại phòng"
              value={roomSearch}
              onChange={(e) => setRoomSearch(e.target.value)}
            />
            <select
              id="walkin-room"
              aria-label="Chọn phòng"
              style={INPUT}
              value={form.roomId}
              onChange={(e) => set({ roomId: e.target.value })}
            >
              <option value="">
                {roomsLoading ? "Đang tải phòng..." : `Chọn phòng (${rooms.length} phòng phù hợp)`}
              </option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.room_name} · tối đa {room.capacity} khách · {Number(room.price).toLocaleString("vi-VN")} đ/đêm
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={LABEL} htmlFor="walkin-guests">Số khách</label>
            <input
              id="walkin-guests"
              type="number"
              min={1}
              style={INPUT}
              value={form.guests}
              onChange={(e) => set({ guests: e.target.value })}
            />
          </div>
          <div>
            <label style={LABEL} htmlFor="walkin-name">Tên khách</label>
            <input
              id="walkin-name"
              type="text"
              maxLength={100}
              style={INPUT}
              value={form.guestName}
              onChange={(e) => set({ guestName: e.target.value })}
            />
          </div>
          <div>
            <label style={LABEL} htmlFor="walkin-phone">Số điện thoại (không bắt buộc)</label>
            <input
              id="walkin-phone"
              type="tel"
              maxLength={30}
              style={INPUT}
              value={form.guestPhone}
              onChange={(e) => set({ guestPhone: e.target.value })}
            />
          </div>
          <div>
            <label style={LABEL} htmlFor="walkin-email">Email (không bắt buộc)</label>
            <input
              id="walkin-email"
              type="email"
              maxLength={255}
              style={INPUT}
              value={form.guestEmail}
              onChange={(e) => set({ guestEmail: e.target.value })}
            />
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 0", color: "var(--color-text-primary)", fontSize: 14 }}>
          <input type="checkbox" checked={form.paid} onChange={(e) => set({ paid: e.target.checked })} />
          Khách đã thanh toán (tiền mặt/chuyển khoản)
        </label>
        <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>
          Nếu có email, khách sẽ nhận được thư xác nhận.
        </p>

        {error && (
          <p role="alert" style={{ color: "var(--color-danger)", fontSize: 13, margin: "14px 0 0" }}>{error}</p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: "transparent",
              color: "var(--color-text-secondary)",
              border: "1px solid var(--color-border-soft)",
              borderRadius: 10,
              padding: "10px 16px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Hủy
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              background: "linear-gradient(135deg, var(--color-gold-400), var(--color-gold-500))",
              color: "var(--color-navy-950)",
              border: "none",
              borderRadius: 10,
              padding: "10px 18px",
              fontWeight: 700,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? "Đang tạo..." : "Tạo đặt phòng"}
          </button>
        </div>
      </form>
    </div>
  );
}
