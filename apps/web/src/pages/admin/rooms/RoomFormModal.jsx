import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Field, Modal } from "../../../components/admin/ui";
import { createRoom, updateRoom, uploadRoomImage } from "../../../services/roomService";
import { apiErrorText } from "../../../utils/apiError";
import { IMAGE_TYPES, imageFileProblem } from "../../../utils/imageFile";
import { normalizeImageUrl, showFallback } from "../../../utils/imageUrl";
import RoomGallery from "./RoomGallery";
import { ROOM_STATUSES } from "./roomStatus";

const EMPTY = { room_name: "", room_type: "", location: "", price: "", capacity: 2, description: "", amenities: "", image: "", status: "available" };

// Create a room, or edit one (`room` set). Calls onSaved(name, created).
export default function RoomFormModal({ room, onClose, onSaved }) {
  const { t } = useTranslation("rooms");
  const [form, setForm] = useState(() =>
    room
      ? {
          ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, room[k] ?? EMPTY[k]])),
          price: Number(room.price) || "",
          // Edited as text, one amenity per line.
          amenities: (room.amenities || []).join("\n"),
        }
      : EMPTY
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const uploadCover = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setError("");
    const problem = imageFileProblem(file);
    if (!file || problem) return problem && setError(t(problem));

    setUploading(true);
    try {
      const result = await uploadRoomImage(file);
      setForm((current) => ({ ...current, image: result.image || "" }));
    } catch (err) {
      setError(apiErrorText(err, "rooms:form.uploadFailed"));
    } finally {
      setUploading(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    const price = Number(form.price);
    const capacity = Number(form.capacity);
    if (!form.room_name.trim() || !form.room_type.trim()) return setError(t("form.nameTypeRequired"));
    if (!Number.isFinite(price) || price <= 0) return setError(t("form.priceInvalid"));
    if (!Number.isInteger(capacity) || capacity <= 0) return setError(t("form.capacityInvalid"));

    setSaving(true);
    try {
      const payload = { ...form, price, capacity, amenities: form.amenities.split("\n").map((line) => line.trim()).filter(Boolean) };
      if (room) await updateRoom(room.id, payload);
      else await createRoom(payload);
      onSaved(form.room_name, !room);
    } catch (err) {
      setError(apiErrorText(err, "rooms:form.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={room ? t("form.editTitle") : t("form.addTitle")} onClose={onClose} busy={saving || uploading} wide labelledBy="room-form-title">
      <form onSubmit={submit} className="adm-modal-body" data-testid="room-form">
        <div className="adm-form-grid">
          <Field label={t("form.name")} htmlFor="room-name" wide>
            <input id="room-name" className="adm-input" value={form.room_name} onChange={set("room_name")} maxLength={150} />
          </Field>
          <Field label={t("form.type")} htmlFor="room-type">
            <input id="room-type" className="adm-input" value={form.room_type} onChange={set("room_type")} maxLength={100} placeholder={t("form.typePlaceholder")} />
          </Field>
          <Field label={t("form.status")} htmlFor="room-status">
            <select id="room-status" className="adm-select" value={form.status} onChange={set("status")}>
              {ROOM_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`status.${status}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("form.location")} htmlFor="room-location" hint={t("form.locationHint")} wide>
            <input id="room-location" className="adm-input" value={form.location || ""} onChange={set("location")} maxLength={255} placeholder={t("form.locationPlaceholder")} />
          </Field>
          <Field label={t("form.price")} htmlFor="room-price">
            <input id="room-price" type="number" min="1" className="adm-input" value={form.price} onChange={set("price")} />
          </Field>
          <Field label={t("form.capacity")} htmlFor="room-capacity">
            <input id="room-capacity" type="number" min="1" className="adm-input" value={form.capacity} onChange={set("capacity")} />
          </Field>
          <Field label={t("form.description")} htmlFor="room-description" wide>
            <textarea id="room-description" className="adm-textarea" rows={3} value={form.description || ""} onChange={set("description")} />
          </Field>
          <Field label={t("form.amenities")} htmlFor="room-amenities" hint={t("form.amenitiesHint")} wide>
            <textarea id="room-amenities" className="adm-textarea" rows={4} value={form.amenities} onChange={set("amenities")} />
          </Field>
        </div>

        <Field label={t("form.cover")} hint={t("admin:image.types")}>
          {form.image && (
            <img className="adm-thumb" style={{ width: "100%", height: 170 }} src={normalizeImageUrl(form.image)} alt="" onError={showFallback} />
          )}
          <label className="adm-btn adm-btn--muted adm-btn--small" style={{ alignSelf: "flex-start", opacity: uploading ? 0.6 : 1 }}>
            {uploading ? t("form.uploading") : form.image ? t("form.changeCover") : t("form.uploadCover")}
            <input type="file" accept={IMAGE_TYPES.join(",")} onChange={uploadCover} disabled={uploading || saving} data-testid="room-cover-input" />
          </label>
        </Field>

        {room ? <RoomGallery roomId={room.id} disabled={saving} /> : <p className="adm-hint">{t("gallery.afterSave")}</p>}

        <Alert>{error}</Alert>

        <div className="adm-modal-footer">
          <button type="submit" className="adm-btn adm-btn--primary" disabled={saving || uploading}>
            {saving ? t("admin:saving") : t("admin:save")}
          </button>
          <button type="button" className="adm-btn adm-btn--muted" onClick={onClose} disabled={saving || uploading}>
            {t("admin:cancel")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
