import { useTranslation } from "react-i18next";
import { Avatar, Badge, SkeletonRows } from "../../../components/admin/ui";
import Icon from "../../../utils/icon";
import useIsMobile from "../../../utils/useIsMobile";
import { normalizeImageUrl } from "../../../utils/imageUrl";

function joinedOn(value, language) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(language === "en" ? "en-US" : "vi-VN", { year: "numeric", month: "short", day: "numeric" });
}

function RoleBadge({ role }) {
  const { t } = useTranslation("admin");
  return <Badge tone={role === "admin" ? "danger" : "info"}>{t(`roles.${role}`, { defaultValue: role })}</Badge>;
}

function StatusBadge({ locked }) {
  const { t } = useTranslation("users");
  return (
    <Badge tone={locked ? "danger" : "success"} dot>
      {locked ? t("status.locked") : t("status.active")}
    </Badge>
  );
}

function Actions({ user, isSelf, busy, onEdit, onLock, onDelete, withLabels }) {
  const { t } = useTranslation("users");
  const buttonClass = withLabels ? "adm-btn adm-btn--muted adm-btn--small" : "adm-icon-btn adm-icon-btn--plain";
  return (
    <>
      <button type="button" className={`${buttonClass} is-accent`} onClick={() => onEdit(user)} title={t("actions.edit")} aria-label={t("actions.edit")}>
        <Icon.Edit />
        {withLabels && t("actions.edit")}
      </button>
      <button
        type="button"
        className={`${buttonClass} ${user.is_locked ? "is-warning" : ""}`}
        onClick={() => onLock(user)}
        disabled={isSelf || busy}
        title={isSelf ? t("actions.cannotLockSelf") : user.is_locked ? t("actions.unlock") : t("actions.lock")}
        aria-label={user.is_locked ? t("actions.unlock") : t("actions.lock")}
      >
        {user.is_locked ? <Icon.Unlock /> : <Icon.Lock />}
        {withLabels && (user.is_locked ? t("actions.unlock") : t("actions.lock"))}
      </button>
      <button
        type="button"
        className={`${buttonClass} is-danger`}
        onClick={() => onDelete(user)}
        disabled={isSelf || busy}
        title={isSelf ? t("actions.cannotDeleteSelf") : t("actions.delete")}
        aria-label={t("actions.delete")}
      >
        <Icon.Trash />
        {withLabels && t("actions.delete")}
      </button>
    </>
  );
}

// The users of one page: a table on wide screens, cards on phones.
export default function UsersTable({ users, loading, currentUserId, busyId, onEdit, onLock, onDelete }) {
  const { t, i18n } = useTranslation("users");
  const isMobile = useIsMobile();
  const actionProps = { onEdit, onLock, onDelete };

  if (isMobile) {
    if (loading) return <div className="adm-cards"><div className="luxe-skeleton" style={{ height: 120 }} /></div>;
    if (users.length === 0) return <p className="adm-empty">{t("empty")}</p>;
    return (
      <div className="adm-cards">
        {users.map((user) => (
          <div key={user.id} className="adm-card">
            <div className="adm-person">
              <Avatar name={user.name} id={user.id} src={user.avatar_url ? normalizeImageUrl(user.avatar_url, "") : ""} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="is-strong" style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{user.name}</div>
                <div className="adm-cell-sub">{user.email}</div>
              </div>
              <RoleBadge role={user.role} />
            </div>
            <div className="adm-card-row">
              <StatusBadge locked={user.is_locked} />
              <span>{t("joined", { date: joinedOn(user.created_at, i18n.language) })}</span>
            </div>
            <div className="adm-card-actions">
              <Actions user={user} isSelf={user.id === currentUserId} busy={busyId === user.id} withLabels {...actionProps} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="adm-table-wrap">
      <table className="adm-table" style={{ minWidth: 880 }} data-testid="users-table">
        <thead>
          <tr>
            <th>{t("columns.person")}</th>
            <th>{t("columns.role")}</th>
            <th>{t("columns.contact")}</th>
            <th>{t("columns.status")}</th>
            <th>{t("columns.joined")}</th>
            <th className="is-right">{t("columns.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <SkeletonRows rows={6} columns={6} />
          ) : users.length === 0 ? (
            <tr>
              <td colSpan={6} className="adm-empty">{t("empty")}</td>
            </tr>
          ) : (
            users.map((user) => (
              <tr key={user.id}>
                <td>
                  <div className="adm-person">
                    <Avatar name={user.name} id={user.id} src={user.avatar_url ? normalizeImageUrl(user.avatar_url, "") : ""} />
                    <div>
                      <div className="is-strong" style={{ color: "var(--color-text-primary)", fontWeight: 600 }}>{user.name}</div>
                      <div className="adm-cell-sub">#{user.id}</div>
                    </div>
                  </div>
                </td>
                <td><RoleBadge role={user.role} /></td>
                <td>
                  <div>{user.email}</div>
                  <div className="adm-cell-sub">{user.phone || "—"}</div>
                </td>
                <td><StatusBadge locked={user.is_locked} /></td>
                <td>{joinedOn(user.created_at, i18n.language)}</td>
                <td className="is-right">
                  <div className="adm-row-actions">
                    <Actions user={user} isSelf={user.id === currentUserId} busy={busyId === user.id} {...actionProps} />
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
