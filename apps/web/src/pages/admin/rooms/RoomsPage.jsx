import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Alert, PageHeader, Pagination, RefreshButton } from "../../../components/admin/ui";
import ConfirmModal from "../../../components/ConfirmModal";
import { useToast } from "../../../context/ToastContext";
import { deleteRoom, getRooms } from "../../../services/roomService";
import { apiErrorText } from "../../../utils/apiError";
import Icon from "../../../utils/icon";
import { useAsyncData } from "../../../utils/useAsyncData";
import RoomFilters from "./RoomFilters";
import RoomFormModal from "./RoomFormModal";
import RoomsTable from "./RoomsTable";

const QUERY_KEYS = ["q", "status", "minPrice", "maxPrice", "minCapacity", "sortBy", "sortOrder", "page", "limit"];

// Admin: the room list, filtered and paged on the server; filters live in
// the URL so a filtered list can be bookmarked or shared.
export default function RoomsPage() {
  const { t } = useTranslation("rooms");
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = useState(null); // null | "new" | room
  const [toDelete, setToDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [actionError, setActionError] = useState("");

  const query = useMemo(() => {
    const params = Object.fromEntries(QUERY_KEYS.map((key) => [key, searchParams.get(key)]).filter(([, value]) => value));
    return { page: "1", limit: "10", sortBy: "created_at", sortOrder: "desc", ...params };
  }, [searchParams]);

  const updateQuery = (changes, resetPage = true) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(changes).forEach(([key, value]) => (value === "" || value == null ? next.delete(key) : next.set(key, value)));
    if (resetPage) next.set("page", "1");
    setSearchParams(next);
  };

  const { data, loading, error, reload } = useAsyncData(`rooms:${JSON.stringify(query)}`, () => getRooms(query));
  const rooms = Array.isArray(data) ? data : data?.data || [];
  const pagination = (!Array.isArray(data) && data?.pagination) || { page: 1, limit: rooms.length || 10, total: rooms.length, totalPages: 1 };

  const confirmDelete = async () => {
    setDeletingId(toDelete.id);
    setActionError("");
    try {
      await deleteRoom(toDelete.id);
      toast.success(t("toast.deleted", { name: toDelete.room_name }));
      reload();
    } catch (err) {
      const message = apiErrorText(err, "rooms:deleteFailed");
      setActionError(message);
      toast.error(message);
    } finally {
      setDeletingId(null);
      setToDelete(null);
    }
  };

  return (
    <div data-testid="rooms-page">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <RefreshButton onClick={reload} loading={loading} />
            <button type="button" className="adm-btn adm-btn--primary" onClick={() => setEditing("new")}>
              <Icon.Rooms />
              {t("add")}
            </button>
          </>
        }
      />

      <Alert>{actionError || (error ? apiErrorText(error, "admin:loadFailed") : "")}</Alert>

      <div className="adm-panel" style={{ overflow: "hidden" }}>
        <RoomFilters query={query} onChange={updateQuery} />

        {!loading && rooms.length === 0 ? (
          <div className="adm-empty">
            <p>{t("empty")}</p>
            <button type="button" className="adm-btn adm-btn--ghost" onClick={() => setEditing("new")}>
              {t("addFirst")}
            </button>
          </div>
        ) : (
          <RoomsTable rooms={rooms} loading={loading && !data} deletingId={deletingId} onEdit={setEditing} onDelete={setToDelete} />
        )}

        {pagination.total > 0 && (
          <Pagination
            page={Number(pagination.page)}
            totalPages={Number(pagination.totalPages)}
            total={Number(pagination.total)}
            pageSize={Number(pagination.limit)}
            onChange={(page) => updateQuery({ page: String(page) }, false)}
            testId="rooms-pagination"
          />
        )}
      </div>

      {editing && (
        <RoomFormModal
          room={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(name, created) => {
            setEditing(null);
            toast.success(created ? t("toast.created", { name }) : t("toast.updated", { name }));
            reload();
          }}
        />
      )}

      <ConfirmModal
        open={Boolean(toDelete)}
        title={t("confirm.deleteTitle")}
        message={t("confirm.deleteMessage", { name: toDelete?.room_name })}
        confirmLabel={t("admin:delete")}
        tone="danger"
        // Gone for good, photos included: typed to confirm.
        confirmCode={toDelete ? `ROOM-${toDelete.id}` : undefined}
        loading={Boolean(toDelete) && deletingId === toDelete.id}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
