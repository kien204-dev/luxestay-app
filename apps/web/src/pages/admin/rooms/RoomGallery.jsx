import { useState } from "react";
import { useTranslation } from "react-i18next";
import { addRoomImage, deleteRoomImage, getRoomById } from "../../../services/roomService";
import { apiErrorText } from "../../../utils/apiError";
import { IMAGE_TYPES, imageFileProblem } from "../../../utils/imageFile";
import { normalizeImageUrl, showFallback } from "../../../utils/imageUrl";
import { useAsyncData } from "../../../utils/useAsyncData";

// Extra photos of an existing room, shown on its page as a gallery.
export default function RoomGallery({ roomId, disabled }) {
  const { t } = useTranslation("rooms");
  const { data, setData, error: loadError } = useAsyncData(`room-gallery:${roomId}`, async () => (await getRoomById(roomId)).images || []);
  const images = data || [];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const add = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    setError("");
    const problem = imageFileProblem(file);
    if (!file || problem) return problem && setError(t(problem));

    setBusy(true);
    try {
      const result = await addRoomImage(roomId, file);
      setData((current) => [...(current || []), result.image]);
    } catch (err) {
      setError(apiErrorText(err, "rooms:gallery.uploadFailed"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (imageId) => {
    setError("");
    try {
      await deleteRoomImage(roomId, imageId);
      setData((current) => (current || []).filter((image) => image.id !== imageId));
    } catch (err) {
      setError(apiErrorText(err, "rooms:gallery.deleteFailed"));
    }
  };

  return (
    <div className="adm-field">
      <span className="adm-label">{t("gallery.title")}</span>
      {images.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {images.map((image) => (
            <div key={image.id} style={{ position: "relative" }}>
              <img className="adm-thumb" style={{ width: "100%", height: 70 }} src={normalizeImageUrl(image.image_path)} alt="" onError={showFallback} />
              <button
                type="button"
                className="adm-icon-btn adm-icon-btn--plain is-danger"
                onClick={() => remove(image.id)}
                title={t("gallery.remove")}
                aria-label={t("gallery.remove")}
                style={{ position: "absolute", top: 2, right: 2, width: 26, height: 26, background: "color-mix(in srgb, var(--color-navy-950) 80%, transparent)" }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="adm-btn adm-btn--muted adm-btn--small" style={{ alignSelf: "flex-start", opacity: busy || disabled ? 0.6 : 1 }}>
        {busy ? t("gallery.uploading") : t("gallery.add")}
        <input type="file" accept={IMAGE_TYPES.join(",")} onChange={add} disabled={busy || disabled} data-testid="room-gallery-input" />
      </label>
      {(error || loadError) && <p className="adm-hint" style={{ color: "var(--color-danger)" }}>{error || t("gallery.loadFailed")}</p>}
    </div>
  );
}
