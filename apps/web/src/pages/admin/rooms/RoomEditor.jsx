import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AxIcon from "../../../components/admin/AxIcon";
import { EmptyState, Skel } from "../../../components/admin/ax";
import { FormSection, SaveBar, Stepper, useLeaveWarning } from "../../../components/admin/form";
import { Control, Field, inputProps } from "../../../components/auth/fields";
import { useToast } from "../../../context/ToastContext";
import { addRoomImage, createRoom, deleteRoomImage, getRoomById, setRoomCover, updateRoom } from "../../../services/roomService";
import { apiErrorText } from "../../../utils/apiError";
import { formatMoney } from "../../../utils/format";
import { useAsyncData } from "../../../utils/useAsyncData";
import { useDocumentTitle } from "../../../utils/useDocumentTitle";
import PhotoManager from "./PhotoManager";
import RoomTypeField, { sameType, useRoomTypes } from "./RoomTypeField";

// The API's limits (roomController).
const MAX_AMENITIES = 30;
const MAX_AMENITY_LENGTH = 60;
const FIELDS = ["room_name", "room_type", "location", "description", "price", "capacity", "status", "amenities"];

const EMPTY = { room_name: "", room_type: "", location: "", description: "", price: "", capacity: 2, status: "available", amenities: [] };

function fromRoom(room) {
  return {
    room_name: room.room_name || "",
    room_type: room.room_type || "",
    location: room.location || "",
    description: room.description || "",
    price: room.price ? String(Number(room.price)) : "",
    capacity: room.capacity || 1,
    // "booked" is worked out from the bookings; the admin only switches
    // maintenance on or off.
    status: room.status === "maintenance" ? "maintenance" : "available",
    amenities: room.amenities || [],
  };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function Amenities({ value, onChange }) {
  const { t } = useTranslation("rooms");
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const add = () => {
    const item = text.trim();
    if (!item) return;
    if (item.length > MAX_AMENITY_LENGTH) return setError(t("form.amenityTooLong", { max: MAX_AMENITY_LENGTH }));
    if (value.some((existing) => existing.toLowerCase() === item.toLowerCase())) return setError(t("form.amenityExists"));
    if (value.length >= MAX_AMENITIES) return setError(t("form.amenitiesFull", { max: MAX_AMENITIES }));
    onChange([...value, item]);
    setText("");
    setError("");
    return undefined;
  };
  return (
    <div className="ax-amenities">
      {value.length > 0 && (
        <ul className="ax-chipset" aria-label={t("form.amenities")}>
          {value.map((item) => (
            <li key={item} className="ax-chip ax-chip--tag">
              {item}
              <button type="button" aria-label={t("form.amenityRemove", { name: item })} onClick={() => onChange(value.filter((x) => x !== item))}>
                <AxIcon name="close" small />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="ax-inline">
        <div className="fx-control">
          <input
            id="room-amenity"
            value={text}
            maxLength={MAX_AMENITY_LENGTH + 10}
            placeholder={t("form.amenityPlaceholder")}
            aria-label={t("form.amenityAdd")}
            aria-describedby="room-amenity-help"
            onChange={(event) => {
              setText(event.target.value);
              setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
          />
        </div>
        <button type="button" className="g-btn g-btn--outline g-btn--small" onClick={add} disabled={!text.trim()}>
          <AxIcon name="plus" small />
          {t("form.amenityAdd")}
        </button>
      </div>
      <p className={error ? "fx-error" : "fx-help"} id="room-amenity-help" role={error ? "alert" : undefined}>
        {error || t("form.amenitiesHint", { count: value.length, max: MAX_AMENITIES })}
      </p>
    </div>
  );
}

// Admin: a room in its own page, to add or edit: what guests read, price
// and maintenance, how many guests, amenities, and photos. Saved with the
// bar at the bottom, which counts what is not saved yet.
export default function RoomEditor() {
  const { t, i18n } = useTranslation("rooms");
  const lang = i18n.language;
  const { id } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const toast = useToast();
  const types = useRoomTypes();
  const loaded = useAsyncData(isNew ? null : `room-edit:${id}`, () => getRoomById(id));
  const server = loaded.data;
  const [form, setForm] = useState(null);
  const [initial, setInitial] = useState(null);
  const [photos, setPhotos] = useState(null); // { cover, images } of a saved room
  const [queue, setQueue] = useState([]);
  const [addingType, setAddingType] = useState(false);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");

  // The form starts from the room once it has loaded (or empty for a new one).
  const source = isNew ? "new" : server ? `room:${server.id}` : null;
  const [seen, setSeen] = useState(null);
  if (source && source !== seen) {
    setSeen(source);
    const start = isNew ? EMPTY : fromRoom(server);
    setForm(start);
    setInitial(start);
    setPhotos(isNew ? null : { cover: server.image, images: server.images || [] });
  }
  useDocumentTitle(isNew ? t("form.addTitle") : server?.room_name || t("form.editTitle"));

  const changes = form && initial ? FIELDS.filter((key) => !same(form[key], initial[key])).length + (isNew ? queue.length : 0) : 0;
  useLeaveWarning(changes > 0 || saving);

  const errors = {};
  if (form) {
    if (!form.room_name.trim()) errors.room_name = t("form.errors.name");
    if (!form.room_type.trim()) errors.room_type = t("form.errors.type");
    const price = Number(form.price);
    if (!form.price || !Number.isFinite(price) || price <= 0) errors.price = t("form.errors.price");
    if (!Number.isInteger(Number(form.capacity)) || Number(form.capacity) < 1) errors.capacity = t("form.errors.capacity");
  }
  const shown = tried ? errors : {};
  const errorCount = tried ? Object.keys(errors).length : 0;

  const set = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const payload = () => {
    const match = types.list.find((type) => sameType(type, form.room_type));
    return {
      room_name: form.room_name.trim(),
      room_type: match || form.room_type.trim(),
      location: form.location.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      capacity: Number(form.capacity),
      status: form.status,
      amenities: form.amenities,
    };
  };

  const submit = async (event) => {
    event.preventDefault();
    setTried(true);
    if (Object.keys(errors).length) {
      document.getElementById(errors.room_name ? "room-name" : errors.room_type ? "room-type" : errors.price ? "room-price" : "room-capacity")?.focus();
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = (await createRoom(payload())).room;
        // The photos wait for the room to exist; the first becomes the cover.
        let first = null;
        for (const [index, item] of queue.entries()) {
          setProgress(t("photos.uploadingCount", { n: index + 1, count: queue.length }));
          try {
            const result = await addRoomImage(created.id, item.file);
            if (!first) first = result.image;
          } catch (err) {
            toast.error(`${item.name}: ${apiErrorText(err, "rooms:photos.uploadFailed")}`);
          }
        }
        if (first) await setRoomCover(created.id, first.id);
        setInitial(form);
        setQueue([]);
        toast.success(t("toast.created", { name: created.room_name }));
        navigate(`/admin/rooms/${created.id}`, { replace: true });
      } else {
        const saved = (await updateRoom(server.id, { ...payload(), image: photos.cover || "" })).room;
        const next = fromRoom(saved);
        setForm(next);
        setInitial(next);
        setTried(false);
        toast.success(t("toast.updated", { name: saved.room_name }));
      }
    } catch (err) {
      toast.error(apiErrorText(err, "rooms:form.saveFailed"));
    } finally {
      setSaving(false);
      setProgress("");
    }
  };

  // Removing the cover: the first gallery photo takes its place; with no
  // gallery the room is saved without a cover (the rest of the room as it
  // was last saved, not the unsaved form).
  const removeCover = async () => {
    if (photos.images.length) {
      const set = await setRoomCover(server.id, photos.images[0].id);
      await deleteRoomImage(server.id, photos.images[0].id);
      setPhotos({ cover: set.image, images: set.images.filter((image) => image.id !== photos.images[0].id) });
      return;
    }
    const base = fromRoom({ ...server, ...initial });
    await updateRoom(server.id, { ...base, price: Number(base.price), capacity: Number(base.capacity), image: "" });
    setPhotos({ cover: null, images: [] });
  };

  if (!isNew && loaded.error) {
    return (
      <div className="ax-screen" data-testid="room-editor">
        <EmptyState
          error
          icon="alert"
          title={loaded.error.response?.status === 404 ? t("form.notFound") : t("form.loadFailed")}
          actions={
            <>
              <Link className="g-btn g-btn--outline" to="/admin/rooms">{t("form.backToList")}</Link>
              {loaded.error.response?.status !== 404 && <button type="button" className="g-btn g-btn--primary" onClick={loaded.reload}>{t("admin:retry")}</button>}
            </>
          }
        >
          {apiErrorText(loaded.error, "admin:loadFailed")}
        </EmptyState>
      </div>
    );
  }

  // Also right after a new room is saved: the page moves to the room's
  // address and waits for it before showing the form again.
  if (!form || (!isNew && !server)) {
    return (
      <div className="ax-screen" aria-busy="true" data-testid="room-editor-loading">
        <Skel variant="title" width="40%" />
        <div className="ax-card ax-card--pad"><Skel height={260} /></div>
        <div className="ax-card ax-card--pad"><Skel height={200} /></div>
      </div>
    );
  }

  const title = isNew ? t("form.addTitle") : t("form.editTitle");

  return (
    <form className="ax-screen ax-editor" onSubmit={submit} noValidate data-testid="room-form" aria-labelledby="room-editor-title">
      <div className="ax-head">
        <div>
          <nav aria-label={t("admin:crumbs.label")}>
            <ol className="ax-crumbs">
              <li><Link to="/admin/rooms">{t("title")}</Link></li>
              <li aria-current="page">{isNew ? t("form.addTitle") : server.room_name}</li>
            </ol>
          </nav>
          <h1 id="room-editor-title">{title}</h1>
          <p>{isNew ? t("form.addSubtitle") : t("form.editSubtitle", { code: `ROOM-${server.id}`, price: formatMoney(server.price, lang) })}</p>
        </div>
        {!isNew && (
          <div className="ax-actions">
            <a className="g-btn g-btn--outline" href={`/rooms/${server.id}`} target="_blank" rel="noreferrer">
              <AxIcon name="external" small />
              {t("form.viewOnSite")}
            </a>
          </div>
        )}
      </div>

      <div className="ax-card ax-fcard">
        <FormSection id="room-info" title={t("form.sectionInfo")} description={t("form.sectionInfoHint")}>
          <div className="ax-g2">
            <Field id="room-name" label={t("form.name")} error={shown.room_name}>
              <Control invalid={shown.room_name}>
                <input {...inputProps("room-name", shown.room_name)} value={form.room_name} maxLength={150} onChange={(e) => set("room_name")(e.target.value)} />
              </Control>
            </Field>
            <RoomTypeField
              value={form.room_type}
              onChange={set("room_type")}
              adding={addingType}
              onAdding={setAddingType}
              types={types}
              error={shown.room_type}
              describedBy={shown.room_type ? "room-type-error" : undefined}
            />
          </div>
          <Field id="room-location" label={t("form.location")} help={<p className="fx-help">{t("form.locationHint")}</p>}>
            <Control>
              <input id="room-location" value={form.location} maxLength={255} placeholder={t("form.locationPlaceholder")} onChange={(e) => set("location")(e.target.value)} />
            </Control>
          </Field>
          <Field id="room-description" label={t("form.description")} help={<p className="fx-help">{t("form.descriptionCount", { count: form.description.length })}</p>}>
            <div className="fx-control">
              <textarea id="room-description" rows={4} value={form.description} onChange={(e) => set("description")(e.target.value)} />
            </div>
          </Field>
        </FormSection>

        <FormSection id="room-price" title={t("form.sectionPrice")} description={t("form.sectionPriceHint")}>
          <div className="ax-g2">
            <Field id="room-price" label={t("form.price")} error={shown.price}>
              <Control invalid={shown.price}>
                <input {...inputProps("room-price", shown.price)} type="number" inputMode="numeric" min="1" step="1000" value={form.price} onChange={(e) => set("price")(e.target.value)} />
                <span className="ax-suffix">{t("form.perNight")}</span>
              </Control>
            </Field>
            <div className="g-field">
              <span className="g-label">{t("form.status")}</span>
              <label className="ax-switch ax-switch--field">
                <input type="checkbox" role="switch" checked={form.status === "maintenance"} onChange={(e) => set("status")(e.target.checked ? "maintenance" : "available")} data-testid="room-maintenance" />
                {t("form.maintenance")}
              </label>
              <p className="fx-help">{t("form.maintenanceHint")}</p>
            </div>
          </div>
        </FormSection>

        <FormSection id="room-capacity" title={t("form.sectionCapacity")} description={t("form.sectionCapacityHint")}>
          <Stepper
            id="room-capacity"
            label={t("form.capacity")}
            value={form.capacity}
            min={1}
            max={20}
            onChange={set("capacity")}
            help={shown.capacity ? <p className="fx-error" role="alert">{shown.capacity}</p> : null}
          />
        </FormSection>

        <FormSection id="room-amenities" title={t("form.amenities")} description={t("form.amenitiesSection")}>
          <Amenities value={form.amenities} onChange={set("amenities")} />
        </FormSection>

        <FormSection id="room-photos" title={t("photos.title")} description={t("photos.hint")}>
          <PhotoManager
            roomId={isNew ? null : server.id}
            cover={photos?.cover}
            images={photos?.images || []}
            onSynced={setPhotos}
            onRemoveCover={removeCover}
            queue={queue}
            setQueue={setQueue}
            disabled={saving}
          />
          {!isNew && <p className="fx-help">{t("photos.savedAtOnce")}</p>}
        </FormSection>
      </div>

      <SaveBar
        changes={changes}
        errors={errorCount}
        saving={saving}
        onCancel={() => navigate("/admin/rooms")}
        cancelLabel={t("form.cancel")}
        saveLabel={isNew ? t("form.create") : t("form.save")}
        extra={progress ? <span className="ax-savebar__p" role="status">{progress}</span> : null}
        testId="room-savebar"
      />
    </form>
  );
}
