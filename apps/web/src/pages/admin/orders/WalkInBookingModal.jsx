import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Field, Modal } from "../../../components/admin/ui";
import { createBooking } from "../../../services/bookingService";
import { getRooms } from "../../../services/roomService";
import { apiErrorText } from "../../../utils/apiError";
import { localDateString } from "../../../utils/date";
import { formatMoney } from "../../../utils/format";
import { useAsyncData } from "../../../utils/useAsyncData";

const EMPTY = { roomId: "", checkIn: "", checkOut: "", guests: 1, guestName: "", guestPhone: "", guestEmail: "", paid: false };

// Admin enters a booking for a guest at the desk or on the phone. It is
// confirmed straight away; "paid" records money already taken.
export default function WalkInBookingModal({ onClose, onCreated }) {
  const { t, i18n } = useTranslation("orders");
  const [form, setForm] = useState(EMPTY);
  const [roomSearch, setRoomSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const datesChosen = form.checkIn && form.checkOut && form.checkOut > form.checkIn;

  const { data, loading } = useAsyncData(`walk-in-rooms:${roomSearch}:${datesChosen ? `${form.checkIn}:${form.checkOut}` : ""}`, () =>
    getRooms({
      bookable: true,
      limit: 100,
      sortBy: "name",
      sortOrder: "asc",
      ...(roomSearch.trim() ? { q: roomSearch.trim() } : {}),
      // Once dates are chosen, only offer rooms that are free for them.
      ...(datesChosen ? { checkIn: form.checkIn, checkOut: form.checkOut } : {}),
    })
  );
  const rooms = data?.data || [];
  const today = localDateString();
  const set = (changes) => setForm((current) => ({ ...current, ...changes }));

  const submit = async (event) => {
    event.preventDefault();
    if (!form.roomId) return setError(t("walkInForm.roomRequired"));
    if (!datesChosen) return setError(t("walkInForm.datesRequired"));
    if (!form.guestName.trim()) return setError(t("walkInForm.nameRequired"));

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
      setError(apiErrorText(err, "orders:walkInForm.failed"));
    } finally {
      setSubmitting(false);
    }
    return undefined;
  };

  return (
    <Modal title={t("walkInForm.title")} onClose={onClose} busy={submitting} wide labelledBy="walkin-title">
      <form onSubmit={submit} className="adm-modal-body" aria-label={t("walkInForm.title")} noValidate>
        <p className="adm-hint" style={{ margin: 0 }}>{t("walkInForm.intro")}</p>
        <div className="adm-form-grid">
          <Field label={t("walkInForm.checkIn")} htmlFor="walkin-check-in">
            <input id="walkin-check-in" type="date" className="adm-input" min={today} value={form.checkIn} onChange={(e) => set({ checkIn: e.target.value, roomId: "" })} />
          </Field>
          <Field label={t("walkInForm.checkOut")} htmlFor="walkin-check-out">
            <input id="walkin-check-out" type="date" className="adm-input" min={form.checkIn || today} value={form.checkOut} onChange={(e) => set({ checkOut: e.target.value, roomId: "" })} />
          </Field>
          <Field label={t("walkInForm.room")} htmlFor="walkin-room-search" wide>
            <input id="walkin-room-search" type="search" className="adm-input" placeholder={t("walkInForm.roomSearch")} value={roomSearch} onChange={(e) => setRoomSearch(e.target.value)} />
            <select id="walkin-room" aria-label={t("walkInForm.chooseRoom")} className="adm-select" value={form.roomId} onChange={(e) => set({ roomId: e.target.value })}>
              <option value="">{loading ? t("walkInForm.loadingRooms") : t("walkInForm.chooseRoomCount", { count: rooms.length })}</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {t("walkInForm.roomOption", { name: room.room_name, capacity: room.capacity, price: formatMoney(room.price, i18n.language) })}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("walkInForm.guests")} htmlFor="walkin-guests">
            <input id="walkin-guests" type="number" min={1} className="adm-input" value={form.guests} onChange={(e) => set({ guests: e.target.value })} />
          </Field>
          <Field label={t("walkInForm.name")} htmlFor="walkin-name">
            <input id="walkin-name" type="text" maxLength={100} className="adm-input" value={form.guestName} onChange={(e) => set({ guestName: e.target.value })} />
          </Field>
          <Field label={t("walkInForm.phone")} htmlFor="walkin-phone">
            <input id="walkin-phone" type="tel" maxLength={30} className="adm-input" value={form.guestPhone} onChange={(e) => set({ guestPhone: e.target.value })} />
          </Field>
          <Field label={t("walkInForm.email")} htmlFor="walkin-email">
            <input id="walkin-email" type="email" maxLength={255} className="adm-input" value={form.guestEmail} onChange={(e) => set({ guestEmail: e.target.value })} />
          </Field>
        </div>

        <label className="adm-checkbox">
          <input type="checkbox" checked={form.paid} onChange={(e) => set({ paid: e.target.checked })} />
          {t("walkInForm.paid")}
        </label>
        <p className="adm-hint" style={{ margin: 0 }}>{t("walkInForm.emailNote")}</p>

        <Alert>{error}</Alert>

        <div className="adm-modal-footer">
          <button type="submit" className="adm-btn adm-btn--primary" disabled={submitting}>
            {submitting ? t("walkInForm.creating") : t("walkInForm.create")}
          </button>
          <button type="button" className="adm-btn adm-btn--muted" onClick={onClose} disabled={submitting}>
            {t("admin:cancel")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
