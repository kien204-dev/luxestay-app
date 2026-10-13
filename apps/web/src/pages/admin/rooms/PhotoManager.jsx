import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import AxIcon from "../../../components/admin/AxIcon";
import ConfirmModal from "../../../components/ConfirmModal";
import { useToast } from "../../../context/ToastContext";
import { addRoomImage, deleteRoomImage, reorderRoomImages, setRoomCover } from "../../../services/roomService";
import { apiErrorText } from "../../../utils/apiError";
import { IMAGE_TYPES, imageFileProblem } from "../../../utils/imageFile";
import { normalizeImageUrl, showFallback } from "../../../utils/imageUrl";

// Photos a room can hold: the cover plus the API's 30 gallery photos.
export const MAX_PHOTOS = 31;

// A room's photos as one row of tiles: the cover first (gold frame), then
// the gallery in its order. Photos are dropped on the box or picked from
// the computer, several at once, each with its own progress; dragged to
// reorder (dropping one first makes it the cover), starred to become the
// cover, or deleted. The arrow buttons do the same from the keyboard.
//
// Editing a saved room (`roomId`), every change is sent at once. A new room
// has no id yet: the photos wait in `queue` (files with a preview) and the
// page uploads them after creating the room, the first as the cover.
export default function PhotoManager({ roomId, cover, images, onSynced, onRemoveCover, queue, setQueue, disabled }) {
  const { t } = useTranslation("rooms");
  const toast = useToast();
  const inputId = useId();
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [uploads, setUploads] = useState([]); // { key, name, preview, progress }
  const [dragKey, setDragKey] = useState(null);
  const [toRemove, setToRemove] = useState(null);
  const [busy, setBusy] = useState(false);
  const previews = useRef(new Set());
  const saved = Boolean(roomId);

  // Object URLs of previews are released when no longer shown.
  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);
  const previewOf = (file) => {
    const url = URL.createObjectURL(file);
    previews.current.add(url);
    return url;
  };

  // The tiles in order: cover, gallery (saved room) or the queue (new room).
  const tiles = saved
    ? [
        ...(cover ? [{ key: "cover", kind: "cover", src: normalizeImageUrl(cover) }] : []),
        ...images.map((image) => ({ key: `g${image.id}`, kind: "gallery", id: image.id, src: normalizeImageUrl(image.image_path) })),
      ]
    : queue.map((item, index) => ({ key: item.key, kind: index === 0 ? "cover" : "queued", src: item.preview, name: item.name }));
  const count = tiles.length + uploads.length;

  const accept = (files) => {
    const room = MAX_PHOTOS - count;
    const chosen = [];
    for (const file of files) {
      const problem = imageFileProblem(file);
      if (problem) toast.error(`${file.name}: ${t(problem)}`);
      else chosen.push(file);
    }
    if (chosen.length > room) toast.error(t("photos.tooMany", { max: MAX_PHOTOS }));
    return chosen.slice(0, Math.max(0, room));
  };

  const addFiles = async (fileList) => {
    const files = accept(Array.from(fileList || []));
    if (!files.length) return;
    if (!saved) {
      setQueue((current) => [...current, ...files.map((file, i) => ({ key: `q${Date.now()}-${i}-${file.name}`, file, name: file.name, preview: previewOf(file) }))]);
      return;
    }
    const added = files.map((file, i) => ({ key: `u${Date.now()}-${i}`, file, name: file.name, preview: previewOf(file), progress: 0 }));
    setUploads((current) => [...current, ...added]);
    let latest = { cover, images };
    // One at a time: each photo is processed on the server as it arrives.
    for (const item of added) {
      try {
        const result = await addRoomImage(roomId, item.file, (progress) =>
          setUploads((current) => current.map((u) => (u.key === item.key ? { ...u, progress } : u)))
        );
        latest = { ...latest, images: [...latest.images, result.image] };
        // A room without a cover takes its first photo as the cover.
        if (!latest.cover) {
          const set = await setRoomCover(roomId, result.image.id);
          latest = { cover: set.image, images: set.images };
        }
        onSynced(latest);
      } catch (err) {
        toast.error(`${item.name}: ${apiErrorText(err, "rooms:photos.uploadFailed")}`);
      } finally {
        setUploads((current) => current.filter((u) => u.key !== item.key));
      }
    }
  };

  const run = async (work, success) => {
    setBusy(true);
    try {
      await work();
      if (success) toast.success(success);
    } catch (err) {
      toast.error(apiErrorText(err, "rooms:photos.failed"));
    } finally {
      setBusy(false);
    }
  };

  const makeCover = (tile) => {
    if (!saved) {
      setQueue((current) => [current.find((item) => item.key === tile.key), ...current.filter((item) => item.key !== tile.key)]);
      return;
    }
    run(async () => {
      const set = await setRoomCover(roomId, tile.id);
      onSynced({ cover: set.image, images: set.images });
    }, t("photos.coverSet"));
  };

  // Moves a tile to `index` among the tiles.
  const moveTo = (tile, index) => {
    const from = tiles.findIndex((item) => item.key === tile.key);
    if (from === index || index < 0 || index >= tiles.length) return;
    if (index === 0 && tile.kind !== "cover") return makeCover(tile);
    if (!saved) {
      setQueue((current) => {
        const next = current.slice();
        const [moved] = next.splice(from, 1);
        next.splice(index, 0, moved);
        return next;
      });
      return;
    }
    if (tile.kind === "cover") return;
    // The gallery alone is reordered (the cover keeps its place).
    const offset = cover ? 1 : 0;
    const next = images.slice();
    const [moved] = next.splice(from - offset, 1);
    next.splice(Math.max(0, index - offset), 0, moved);
    onSynced({ cover, images: next });
    run(() => reorderRoomImages(roomId, next.map((image) => image.id)));
  };

  const remove = async (tile) => {
    setToRemove(null);
    if (!saved) {
      setQueue((current) => current.filter((item) => item.key !== tile.key));
      return;
    }
    await run(async () => {
      if (tile.kind === "gallery") {
        await deleteRoomImage(roomId, tile.id);
        onSynced({ cover, images: images.filter((image) => image.id !== tile.id) });
      } else {
        await onRemoveCover();
      }
    }, t("photos.removed"));
  };

  const onDrop = (event) => {
    event.preventDefault();
    setOver(false);
    if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
  };

  return (
    <div className="ax-photos" data-testid="room-photos">
      <div
        className={`ax-drop${over ? " is-over" : ""}`}
        onDragOver={(event) => {
          if (Array.from(event.dataTransfer?.types || []).includes("Files")) {
            event.preventDefault();
            setOver(true);
          }
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        data-testid="room-dropzone"
      >
        <AxIcon name="upload" className="ax-drop__icon" />
        <p className="ax-drop__t">{over ? t("photos.dropNow") : t("photos.drop")}</p>
        <p className="ax-drop__d">
          {t("photos.or")}{" "}
          <label htmlFor={inputId} className="ax-drop__pick">{t("photos.pick")}</label>
          {" · "}
          {t("photos.limit", { count: Math.max(0, MAX_PHOTOS - count), max: MAX_PHOTOS })}
        </p>
        <input
          ref={input}
          id={inputId}
          className="sr-only"
          type="file"
          accept={IMAGE_TYPES.join(",")}
          multiple
          disabled={disabled || count >= MAX_PHOTOS}
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
          data-testid="room-photo-input"
        />
      </div>

      {(tiles.length > 0 || uploads.length > 0) && (
        <ul className="ax-ptiles" aria-label={t("photos.label")}>
          {tiles.map((tile, index) => (
            <li
              key={tile.key}
              className={`ax-ptile${tile.kind === "cover" ? " is-cover" : ""}${dragKey === tile.key ? " is-dragging" : ""}`}
              draggable={!busy && !disabled}
              onDragStart={(event) => {
                setDragKey(tile.key);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", tile.key);
              }}
              onDragEnd={() => setDragKey(null)}
              onDragOver={(event) => {
                if (dragKey) event.preventDefault();
              }}
              onDrop={(event) => {
                if (!dragKey) return;
                event.preventDefault();
                event.stopPropagation();
                const dragged = tiles.find((item) => item.key === dragKey);
                setDragKey(null);
                if (dragged) moveTo(dragged, index);
              }}
              data-testid="room-photo"
            >
              <img src={tile.src} alt={tile.kind === "cover" ? t("photos.coverAlt", { n: index + 1 }) : t("photos.alt", { n: index + 1 })} onError={showFallback} />
              {tile.kind === "cover" && <span className="ax-ptile__badge">{t("photos.cover")}</span>}
              {tile.kind === "queued" || (!saved && tile.kind === "cover") ? <span className="ax-ptile__wait">{t("photos.waiting")}</span> : null}
              <span className="ax-ptile__tools">
                <button type="button" className="ax-ptile__btn" aria-label={t("photos.moveBack", { n: index + 1 })} disabled={busy || index === 0} onClick={() => moveTo(tile, index - 1)}>
                  <AxIcon name="chevronLeft" small />
                </button>
                <button type="button" className="ax-ptile__btn" aria-label={t("photos.moveForward", { n: index + 1 })} disabled={busy || index === tiles.length - 1 || (saved && tile.kind === "cover")} onClick={() => moveTo(tile, index + 1)}>
                  <AxIcon name="chevronRight" small />
                </button>
                {tile.kind !== "cover" && (
                  <button type="button" className="ax-ptile__btn" aria-label={t("photos.makeCover", { n: index + 1 })} title={t("photos.makeCoverShort")} disabled={busy} onClick={() => makeCover(tile)} data-testid="photo-make-cover">
                    <AxIcon name="star" small />
                  </button>
                )}
                <button type="button" className="ax-ptile__btn is-danger" aria-label={t("photos.remove", { n: index + 1 })} disabled={busy} onClick={() => (saved ? setToRemove(tile) : remove(tile))} data-testid="photo-remove">
                  <AxIcon name="trash" small />
                </button>
              </span>
            </li>
          ))}
          {uploads.map((item) => (
            <li key={item.key} className="ax-ptile is-uploading" aria-busy="true" data-testid="room-photo-uploading">
              <img src={item.preview} alt="" />
              <span className="ax-ptile__progress" role="status">
                {t("photos.uploading", { percent: Math.round(item.progress * 100) })}
                <span className="ax-ptile__bar"><i style={{ width: `${Math.round(item.progress * 100)}%` }} /></span>
              </span>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={Boolean(toRemove)}
        title={t("photos.removeTitle")}
        message={toRemove?.kind === "cover" ? t("photos.removeCoverMessage") : t("photos.removeMessage")}
        confirmLabel={t("admin:delete")}
        tone="danger"
        loading={busy}
        onConfirm={() => remove(toRemove)}
        onCancel={() => setToRemove(null)}
      />
    </div>
  );
}
