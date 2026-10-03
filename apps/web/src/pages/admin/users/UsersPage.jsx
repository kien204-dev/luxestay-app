import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, KpiCard, PageHeader, Pagination, RefreshButton } from "../../../components/admin/ui";
import ConfirmModal from "../../../components/ConfirmModal";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { deleteUser, getUsers, setUserLock } from "../../../services/userService";
import { apiErrorText } from "../../../utils/apiError";
import Icon from "../../../utils/icon";
import { useAsyncData } from "../../../utils/useAsyncData";
import UserFormModal from "./UserFormModal";
import UsersTable from "./UsersTable";

const PAGE_SIZE = 15;

// Admin: every account, loaded a page at a time from the server, with
// search and filters applied there too.
export default function UsersPage() {
  const { t } = useTranslation("users");
  const { user: currentUser } = useAuth();
  const toast = useToast();

  const [query, setQuery] = useState({ page: 1, search: "", role: "", status: "" });
  const [searchInput, setSearchInput] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | user
  const [pending, setPending] = useState(null); // { type: "delete" | "lock", user }
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState("");

  const params = { page: query.page, limit: PAGE_SIZE, ...(query.search && { search: query.search }), ...(query.role && { role: query.role }), ...(query.status && { status: query.status }) };
  const { data, loading, error, reload } = useAsyncData(`users:${JSON.stringify(params)}`, () => getUsers(params));
  const users = data?.data || [];
  const summary = data?.summary;
  const update = (changes) => setQuery((current) => ({ ...current, page: 1, ...changes }));

  const afterChange = (message) => {
    toast.success(message);
    reload();
  };

  const confirmPending = async () => {
    const { type, user } = pending;
    setBusyId(user.id);
    setActionError("");
    try {
      if (type === "delete") {
        await deleteUser(user.id);
        afterChange(t("toast.deleted", { name: user.name }));
      } else {
        await setUserLock(user.id, !user.is_locked);
        afterChange(user.is_locked ? t("toast.unlocked", { name: user.name }) : t("toast.locked", { name: user.name }));
      }
      setPending(null);
    } catch (err) {
      const message = apiErrorText(err, "users:actionFailed");
      setActionError(message);
      toast.error(message);
      setPending(null);
    } finally {
      setBusyId(null);
    }
  };

  const kpis = [
    { label: t("kpi.total"), value: summary?.total, icon: Icon.Users, sub: t("kpi.totalSub") },
    { label: t("kpi.admins"), value: summary?.admins, icon: Icon.Shield, tone: "danger", sub: t("kpi.adminsSub") },
    { label: t("kpi.guests"), value: summary?.users, icon: Icon.User, tone: "info", sub: t("kpi.guestsSub") },
    { label: t("kpi.locked"), value: summary?.locked, icon: Icon.Lock, tone: "warning", sub: t("kpi.lockedSub") },
  ];

  return (
    <div data-testid="users-page">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <RefreshButton onClick={reload} loading={loading} />
            <button type="button" className="adm-btn adm-btn--primary" onClick={() => setEditing("new")}>
              <Icon.UserPlus />
              {t("add")}
            </button>
          </>
        }
      />

      <Alert>{actionError || (error ? apiErrorText(error, "admin:loadFailed") : "")}</Alert>

      <div className="adm-kpis">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} value={(kpi.value ?? 0).toLocaleString()} loading={!summary} />
        ))}
      </div>

      <div className="adm-panel" style={{ overflow: "hidden" }}>
        <div className="adm-toolbar">
          <form
            className="adm-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              update({ search: searchInput.trim() });
            }}
          >
            <span><Icon.Search /></span>
            <input
              className="adm-input"
              type="search"
              value={searchInput}
              onChange={(event) => {
                setSearchInput(event.target.value);
                if (!event.target.value) update({ search: "" });
              }}
              placeholder={t("searchPlaceholder")}
              aria-label={t("searchPlaceholder")}
            />
          </form>
          <div className="adm-filters">
            <select className="adm-select adm-select--inline" value={query.role} onChange={(e) => update({ role: e.target.value })} aria-label={t("filters.role")}>
              <option value="">{t("filters.allRoles")}</option>
              <option value="admin">{t("admin:roles.admin")}</option>
              <option value="user">{t("admin:roles.user")}</option>
            </select>
            <select className="adm-select adm-select--inline" value={query.status} onChange={(e) => update({ status: e.target.value })} aria-label={t("filters.status")}>
              <option value="">{t("filters.allStatuses")}</option>
              <option value="active">{t("status.active")}</option>
              <option value="locked">{t("status.locked")}</option>
            </select>
          </div>
        </div>

        <UsersTable
          users={users}
          loading={loading && !data}
          currentUserId={currentUser?.id}
          busyId={busyId}
          onEdit={(user) => setEditing(user)}
          onLock={(user) => setPending({ type: "lock", user })}
          onDelete={(user) => setPending({ type: "delete", user })}
        />

        {data && (
          <Pagination
            page={data.page}
            totalPages={data.totalPages}
            total={data.total}
            pageSize={PAGE_SIZE}
            onChange={(page) => setQuery((current) => ({ ...current, page }))}
            testId="users-pagination"
          />
        )}
      </div>

      {editing && (
        <UserFormModal
          user={editing === "new" ? null : editing}
          isSelf={editing !== "new" && editing.id === currentUser?.id}
          onClose={() => setEditing(null)}
          onSaved={(saved, created) => {
            setEditing(null);
            afterChange(created ? t("toast.created", { name: saved.name }) : t("toast.updated", { name: saved.name }));
          }}
        />
      )}

      <ConfirmModal
        open={Boolean(pending)}
        title={pending?.type === "delete" ? t("confirm.deleteTitle") : pending?.user.is_locked ? t("confirm.unlockTitle") : t("confirm.lockTitle")}
        message={
          pending?.type === "delete"
            ? t("confirm.deleteMessage", { name: pending.user.name })
            : pending?.user.is_locked
              ? t("confirm.unlockMessage", { name: pending?.user.name })
              : t("confirm.lockMessage", { name: pending?.user.name })
        }
        confirmLabel={pending?.type === "delete" ? t("actions.delete") : pending?.user.is_locked ? t("actions.unlock") : t("actions.lock")}
        tone={pending?.type === "delete" ? "danger" : "warning"}
        loading={Boolean(pending) && busyId === pending.user.id}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
