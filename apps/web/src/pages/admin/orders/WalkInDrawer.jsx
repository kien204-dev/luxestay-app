import { useState } from "react";
import { useTranslation } from "react-i18next";
import Dialog, { CloseIcon } from "../../../components/Dialog";
import { Alert } from "../../../components/admin/ax";
import { Control, Field, inputProps } from "../../../components/auth/fields";
import { createBooking } from "../../../services/bookingService";
import { getRoomTypes, getRooms } from "../../../services/roomService";
import { apiErrorText } from "../../../utils/apiError";
import { localDateString } from "../../../utils/date";
import { EMAIL_PATTERN, formatMoney, nightsBetween } from "../../../utils/format";
import { useAsyncData } from "../../../utils/useAsyncData";

// The API's checks for a guest entered at the desk (bookingController).
const PHONE_PATTERN = /^[0-9+\-\s().]{6,30}$/;
const EMPTY = { guestName: "", guestPhone: "", guestEmail: "", checkIn: "", checkOut: "", guests: 1, roomType: "", roomId: "", paid: false };

// A booking entered by the admin for a guest at the desk or on the phone.
// It is confirmed straight away; "paid" records that the money has been
// taken. Rooms offered are the bookable ones still free for the dates.
export default function WalkInDrawer({ onClose, onCreated }) {
  const { t, i18n } = useTranslation("orders");
  const lang = i18n.language;
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const today = localDateString();
  const datesChosen = form.checkIn && form.checkOut && form.checkOut > form.checkIn;
  const nights = datesChosen ? nightsBetween(form.checkIn, form.checkOut) : 0;

  const types = useAsyncData("walk-in-types", getRoomTypes);
  const rooms = useAsyncData(`walk-in-rooms:${form.roomType}:${datesChosen ? `${form.checkIn}:${form.checkOut}` : ""}`, () =>
    getRooms({
      bookable: true,
      limit: 100,
      sortBy: "name",
      sortOrder: "asc",
      ...(form.roomType ? { roomType: form.roomType } : {}),
      ...(datesChosen ? { checkIn: form.checkIn, checkOut: form.checkOut } : {}),
    })
  );
  const roomList = rooms.data?.data || [];
  const room = roomList.find((item) => String(item.id) === String(form.roomId));
  const total = room ? Number(room.price) * nights : 0;

  const set = (changes) => {
    setForm((current) => ({ ...current, ...changes }));
    setErrors((current) => {
      const next = { ...current };
      Object.keys(changes).forEach((key) => delete next[key]);
      return next;
    });
  };

  const validate = () => {
    const found = {};
    if (!form.guestName.trim()) found.guestName = t("walkIn.errors.name");
    if (form.guestPhone.trim() && !PHONE_PATTERN.test(form.guestPhone.trim())) found.guestPhone = t("walkIn.errors.phone");
    if (form.guestEmail.trim() && !EMAIL_PATTERN.test(form.guestEmail.trim())) found.guestEmail = t("walkIn.errors.email");
    if (!form.checkIn) found.checkIn = t("walkIn.errors.checkIn");
    if (!form.checkOut || (form.checkIn && form.checkOut <= form.checkIn)) found.checkOut = t("walkIn.errors.checkOut");
    if (!form.roomId) found.roomId = t("walkIn.errors.room");
    if (Number(form.guests) < 1) found.guests = t("walkIn.errors.guests");
    else if (room && Number(form.guests) > room.capacity) found.guests = t("walkIn.errors.capacity", { count: room.capacity });
    return found;
  };

  const submit = async (event) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setFailure("");
    if (Object.keys(found).length) {
      document.getElementById(`walkin-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    setSubmitting(true);
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
      setFailure(apiErrorText(err, "orders:walkIn.failed"));
      setSubmitting(false);
    }
  };

  const close = () => !submitting && onClose();
  const field = (name) => ({ ...inputProps(`walkin-${name}`, errors[name]) });

  return (
    <Dialog className="ax-drawer ax-drawer--wide" onClose={close} aria-labelledby="walkin-title" data-testid="walk-in-drawer">
      <form className="ax-drawer__form" onSubmit={submit} noValidate>
        <div className="ax-drawer__head">
          <div>
            <div className="ax-eyebrow">{t("walkIn.eyebrow")}</div>
            <h2 id="walkin-title">{t("walkIn.title")}</h2>
          </div>
          <button type="button" className="ax-iconbtn" aria-label={t("common:dialog.close")} onClick={close}>
            <CloseIcon />
          </button>
        </div>

        <div className="ax-drawer__body ax-drawer__body--form">
          <p className="ax-note">{t("walkIn.intro")}</p>
          <p className="ax-section-k">{t("walkIn.guest")}</p>
          <div className="ax-g2">
            <Field id="walkin-guestName" label={t("walkIn.name")} error={errors.guestName}>
              <Control invalid={errors.guestName}>
                <input {...field("guestName")} type="text" maxLength={100} autoComplete="off" value={form.guestName} onChange={(e) => set({ guestName: e.target.value })} data-autofocus />
              </Control>
            </Field>
            <Field id="walkin-guestPhone" label={<>{t("walkIn.phone")} <span className="ax-opt">{t("walkIn.optional")}</span></>} error={errors.guestPhone}>
              <Control invalid={errors.guestPhone}>
                <input {...field("guestPhone")} type="tel" maxLength={30} autoComplete="off" value={form.guestPhone} onChange={(e) => set({ guestPhone: e.target.value })} />
              </Control>
            </Field>
          </div>
          <Field id="walkin-guestEmail" label={<>{t("walkIn.email")} <span className="ax-opt">{t("walkIn.emailWhy")}</span></>} error={errors.guestEmail}>
            <Control invalid={errors.guestEmail}>
              <input {...field("guestEmail")} type="email" maxLength={255} autoComplete="off" value={form.guestEmail} onChange={(e) => set({ guestEmail: e.target.value })} />
            </Control>
          </Field>

          <p className="ax-section-k">{t("walkIn.stay")}</p>
          <div className="ax-g2">
            <Field id="walkin-checkIn" label={t("walkIn.checkIn")} error={errors.checkIn}>
              <Control invalid={errors.checkIn}>
                <input {...field("checkIn")} type="date" min={today} value={form.checkIn} onChange={(e) => set({ checkIn: e.target.value, roomId: "" })} />
              </Control>
            </Field>
            <Field id="walkin-checkOut" label={t("walkIn.checkOut")} error={errors.checkOut} help={nights ? <p className="fx-help">{t("admin:card.nights", { count: nights })}</p> : null}>
              <Control invalid={errors.checkOut}>
                <input {...field("checkOut")} type="date" min={form.checkIn || today} value={form.checkOut} onChange={(e) => set({ checkOut: e.target.value, roomId: "" })} />
              </Control>
            </Field>
          </div>
          <div className="ax-g2">
            <Field
              id="walkin-roomType"
              label={t("walkIn.roomType")}
              help={datesChosen && !rooms.loading ? <p className={`fx-help ${roomList.length ? "ax-ok" : "ax-warn"}`} role="status">{t("walkIn.free", { count: roomList.length })}</p> : null}
            >
              <select id="walkin-roomType" className="ax-select" value={form.roomType} onChange={(e) => set({ roomType: e.target.value, roomId: "" })}>
                <option value="">{t("walkIn.anyType")}</option>
                {(types.data || []).map((type) => (
                  <option key={type.type} value={type.type}>{type.type}</option>
                ))}
              </select>
            </Field>
            <Field id="walkin-roomId" label={t("walkIn.room")} error={errors.roomId}>
              <select {...field("roomId")} className={`ax-select${errors.roomId ? " is-invalid" : ""}`} value={form.roomId} onChange={(e) => set({ roomId: e.target.value })}>
                <option value="">{rooms.loading ? t("walkIn.loadingRooms") : t("walkIn.chooseRoom")}</option>
                {roomList.map((item) => (
                  <option key={item.id} value={item.id}>
                    {t("walkIn.roomOption", { name: item.room_name, capacity: item.capacity, price: formatMoney(item.price, lang) })}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field id="walkin-guests" label={t("walkIn.guests")} error={errors.guests}>
            <Control invalid={errors.guests}>
              <input {...field("guests")} type="number" min={1} max={room?.capacity || 20} value={form.guests} onChange={(e) => set({ guests: e.target.value })} />
            </Control>
          </Field>

          <p className="ax-section-k">{t("walkIn.payment")}</p>
          <label className="ax-switch">
            <input type="checkbox" role="switch" checked={form.paid} onChange={(e) => set({ paid: e.target.checked })} data-testid="walk-in-paid" />
            {t("walkIn.paid")}
          </label>
          <div className="ax-sum">
            <div>
              <span>{room && nights ? t("walkIn.perNight", { price: formatMoney(room.price, lang), count: nights }) : t("walkIn.pickToPrice")}</span>
              <b>{formatMoney(total, lang)}</b>
            </div>
            <div className="is-total">
              <span>{form.paid ? t("walkIn.totalPaid") : t("walkIn.totalDue")}</span>
              <b data-testid="walk-in-total">{formatMoney(total, lang)}</b>
            </div>
          </div>
          <p className="ax-note">{t("walkIn.emailNote")}</p>
          {failure && <Alert>{failure}</Alert>}
        </div>

        <div className="ax-drawer__foot">
          <button type="button" className="g-btn g-btn--outline" onClick={close} disabled={submitting}>
            {t("walkIn.cancel")}
          </button>
          <button type="submit" className="g-btn g-btn--primary is-grow" disabled={submitting} data-testid="walk-in-submit">
            {submitting ? t("walkIn.creating") : t("walkIn.create")}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
