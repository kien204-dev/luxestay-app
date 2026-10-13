import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import AxIcon from "../../../components/admin/AxIcon";
import { Crumbs, EmptyState, Pager, Skel } from "../../../components/admin/ax";
import ConfirmModal from "../../../components/ConfirmModal";
import { Avatar } from "../../../layout/admin/AccountMenu";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { deleteUser, getUsers, setUserLock } from "../../../services/userService";
import { apiErrorText } from "../../../utils/apiError";
import { dayMonth, formatNumber } from "../../../utils/adminFormat";
import { localDateString } from "../../../utils/date";
import { useAsyncData } from "../../../utils/useAsyncData";
import { useDocumentTitle } from "../../../utils/useDocumentTitle";
import { PHONE_QUERY, useMedia } from "../../../utils/useMedia";
import { LockDialog, UserDrawer } from "./UserDialogs";

const PAGE_SIZE = 15;
const FILTERS = [
  { key: "all", params: {} },
  { key: "user", params: { role: "user" }, count: (s) => s.users },
  { key: "admin", params: { role: "admin" }, count: (s) => s.admins },
  { key: "locked", params: { status: "locked" }, count: (s) => s.locked },
];

// Admin: every account, a page at a time from the server, searched by name,
// email or phone. Locking signs the account out everywhere (the API bumps
// its token version) and asks why; an admin cannot lock, demote or delete
// their own account, so there is always an admin left who can sign in.
export default function UsersPage() {
  const { t, i18n } = useTranslation("users");
  const lang = i18n.language;
  const { user: me } = useAuth();
  const toast = useToast();
  const phone = useMedia(PHONE_QUERY);
  const [filter, setFilter] = useState(FILTERS[0]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState(null); // null | "new" | user
  const [locking, setLocking] = useState(null);
  const [pending, setPending] = useState(null); // { type: unlock | delete, user }
  const [busy, setBusy] = useState(false);
  useDocumentTitle(t("title"));

  useEffect(() => {
    if (text.trim() === search) return undefined;
    const timer = setTimeout(() => {
      setSearch(text.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [text, search]);

  const params = { page, limit: PAGE_SIZE, ...filter.params, ...(search && { search }) };
  const { data, error, loading, reload } = useAsyncData(`users:${JSON.stringify(params)}:${version}`, () => getUsers(params));
  const users = data?.data || [];
  const summary = data?.summary;

  const run = async (work, message) => {
    setBusy(true);
    try {
      await work();
      toast.success(message);
      setVersion((v) => v + 1);
      return true;
    } catch (err) {
      toast.error(apiErrorText(err, "users:actionFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const lock = async (choice) => {
    const user = locking;
    if (await run(() => setUserLock(user.id, true, choice), t("toast.locked", { name: user.name }))) setLocking(null);
  };
  const confirmPending = async () => {
    const { type, user } = pending;
    const ok =
      type === "unlock"
        ? await run(() => setUserLock(user.id, false), t("toast.unlocked", { name: user.name }))
        : await run(() => deleteUser(user.id), t("toast.deleted", { name: user.name }));
    if (ok || type === "delete") setPending(null);
    if (ok && type === "delete") setEditing(null);
  };

  const status = (user) =>
    user.is_locked ? (
      <span className="ax-userstate">
        <span className="ax-badge ax-badge--danger">{t("status.locked")}</span>
        {user.lock_reason && <span className="ax-sub">{t(`lock.reasons.${user.lock_reason}`)}</span>}
      </span>
    ) : (
      <span className="ax-badge ax-badge--success">{t("status.active")}</span>
    );
  const actions = (user) => {
    const self = user.id === me?.id;
    return (
      <span className="ax-rowactions">
        {self ? (
          <span className="ax-sub" title={t("actions.cannotLockSelf")}>{t("you")}</span>
        ) : user.is_locked ? (
          <button type="button" className="g-btn g-btn--outline g-btn--small ax-btn-sm" onClick={() => setPending({ type: "unlock", user })} data-testid="user-unlock">
            {t("actions.unlock")}
          </button>
        ) : (
          <button type="button" className="g-btn g-btn--small ax-btn-sm ax-btn-ghost-danger" onClick={() => setLocking(user)} aria-label={t("actions.lockName", { name: user.name })} data-testid="user-lock">
            {t("actions.lock")}
          </button>
        )}
        <button type="button" className="g-btn g-btn--small ax-btn-sm ax-btn-ghost" onClick={() => setEditing(user)} aria-label={t("actions.editName", { name: user.name })}>
          {t("actions.edit")}
        </button>
      </span>
    );
  };
  const joined = (user) => (user.created_at ? dayMonth(localDateString(new Date(user.created_at)), lang, true) : "—");
  const roleBadge = (user) => <span className={`ax-badge ax-badge--plain${user.role === "admin" ? " ax-badge--accent" : ""}`}>{t(`admin:roles.${user.role}`)}</span>;

  let content;
  if (error && !data) {
    content = (
      <EmptyState error icon="alert" title={t("states.errorTitle")} actions={<button type="button" className="g-btn g-btn--primary" onClick={reload}>{t("admin:retry")}</button>} testId="users-error">
        {apiErrorText(error, "admin:loadFailed")}
      </EmptyState>
    );
  } else if (!data) {
    content = (
      <div className="ax-skelrows" aria-busy="true" data-testid="users-loading">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="ax-skelrow">
            <Skel width={32} height={32} style={{ borderRadius: "50%" }} />
            <Skel variant="text" width={220} />
            <Skel width={60} height={22} />
            <Skel variant="text" width={40} />
            <Skel variant="text" width={100} />
            <Skel width={90} height={24} style={{ marginLeft: "auto" }} />
          </div>
        ))}
      </div>
    );
  } else if (users.length === 0) {
    const filtered = Boolean(search) || filter.key !== "all";
    content = (
      <EmptyState
        icon="users"
        title={search ? t("states.noMatch", { term: search }) : t("states.noneHere")}
        actions={filtered ? <button type="button" className="g-btn g-btn--outline" onClick={() => { setText(""); setSearch(""); setFilter(FILTERS[0]); setPage(1); }}>{t("states.clear")}</button> : null}
        testId="users-empty"
      >
        {t("states.noMatchHelp")}
      </EmptyState>
    );
  } else if (phone) {
    content = (
      <div className="ax-ocards" data-testid="users-cards">
        {users.map((user) => (
          <div key={user.id} className="ax-ocard ax-ccard">
            <span className="ax-person">
              <Avatar user={user} small />
              <span className="ax-cellmain">
                <b>{user.name}</b>
                <span className="ax-sub">{user.email}</span>
              </span>
            </span>
            <span className="ax-ocard__r1">
              {roleBadge(user)}
              {status(user)}
            </span>
            <span className="ax-ocard__meta">{t("joinedBookings", { date: joined(user), count: user.booking_count || 0 })}</span>
            <span className="ax-ocard__r3">{actions(user)}</span>
          </div>
        ))}
      </div>
    );
  } else {
    content = (
      <table className="ax-table" data-testid="users-table">
        <thead>
          <tr>
            <th scope="col">{t("columns.person")}</th>
            <th scope="col">{t("columns.role")}</th>
            <th scope="col" className="is-num">{t("columns.bookings")}</th>
            <th scope="col">{t("columns.joined")}</th>
            <th scope="col">{t("columns.status")}</th>
            <th scope="col"><span className="sr-only">{t("columns.actions")}</span></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} data-testid="user-row">
              <td>
                <div className="ax-person">
                  <Avatar user={user} small />
                  <div className="ax-cellmain">
                    <b>{user.name}</b>
                    <div className="ax-sub">{[user.email, user.phone].filter(Boolean).join(" · ")}</div>
                  </div>
                </div>
              </td>
              <td>{roleBadge(user)}</td>
              <td className="is-num">{user.role === "admin" && !user.booking_count ? "—" : formatNumber(user.booking_count || 0, lang)}</td>
              <td>{joined(user)}</td>
              <td>{status(user)}</td>
              <td className="is-right">{actions(user)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="ax-screen" data-testid="users-page">
      <div className="ax-head">
        <div>
          <Crumbs current={t("title")} />
          <h1>{t("title")}</h1>
          <p>
            {summary
              ? [t("head.total", { count: summary.total }), t("head.admins", { count: summary.admins }), t("head.locked", { count: summary.locked })].join(" · ")
              : t("head.loading")}
          </p>
        </div>
        <div className="ax-actions">
          <button type="button" className="g-btn g-btn--primary" onClick={() => setEditing("new")} data-testid="user-add">
            <AxIcon name="plus" small />
            {t("add")}
          </button>
        </div>
      </div>

      <section className="ax-tablewrap" aria-label={t("listLabel")} aria-busy={loading}>
        <div className="ax-tablebar">
          <div className="fx-control ax-tsearch">
            <AxIcon name="search" />
            <input type="search" aria-label={t("search")} placeholder={t("searchPlaceholder")} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="ax-chipset" role="group" aria-label={t("filters.label")}>
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                className="ax-chip"
                aria-pressed={filter.key === item.key}
                onClick={() => {
                  setFilter(item);
                  setPage(1);
                }}
                data-testid={`user-filter-${item.key}`}
              >
                {t(`filters.${item.key}`)}
                {summary && ` · ${item.count ? item.count(summary) : summary.total}`}
              </button>
            ))}
          </div>
        </div>
        <div className={phone ? "ax-tablebody ax-tablebody--cards" : "ax-tablebody"}>{content}</div>
        {data && users.length > 0 && (
          <Pager page={data.page} totalPages={data.totalPages} total={data.total} limit={data.limit} onPage={setPage} ofText={t("of", { count: data.total })} testId="users-pagination" />
        )}
      </section>

      {editing && (
        <UserDrawer
          user={editing === "new" ? null : editing}
          isSelf={editing !== "new" && editing.id === me?.id}
          onClose={() => setEditing(null)}
          onDelete={(user) => setPending({ type: "delete", user })}
          onSaved={(saved, created) => {
            setEditing(null);
            toast.success(created ? t("toast.created", { name: saved.name }) : t("toast.updated", { name: saved.name }));
            setVersion((v) => v + 1);
          }}
        />
      )}
      {locking && <LockDialog user={locking} busy={busy} onConfirm={lock} onClose={() => setLocking(null)} />}
      <ConfirmModal
        open={Boolean(pending)}
        title={pending ? t(`confirm.${pending.type}Title`, { name: pending.user.name }) : ""}
        message={pending ? t(`confirm.${pending.type}Message`, { name: pending.user.name }) : ""}
        confirmLabel={pending ? t(`actions.${pending.type}`) : ""}
        tone={pending?.type === "delete" ? "danger" : "default"}
        loading={busy}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
