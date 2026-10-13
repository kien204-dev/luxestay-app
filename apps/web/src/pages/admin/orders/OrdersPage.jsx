import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AxIcon from "../../../components/admin/AxIcon";
import BookingBadge from "../../../components/admin/BookingBadge";
import OrderCard from "../../../components/admin/OrderCard";
import { Crumbs, EmptyState, Skel } from "../../../components/admin/ax";
import ConfirmModal from "../../../components/ConfirmModal";
import { initials } from "../../../layout/admin/AccountMenu";
import { useBookingNotifications } from "../../../context/BookingNotificationsContext";
import { useToast } from "../../../context/ToastContext";
import { confirmRefund, deleteBooking, downloadBookingReceipt, getBookingCounts, getBookings, markBookingPaid, updateBooking } from "../../../services/bookingService";
import { getRoomTypes } from "../../../services/roomService";
import { apiErrorText } from "../../../utils/apiError";
import { bookingCode, bookingRef } from "../../../utils/bookingCode";
import { localDateString } from "../../../utils/date";
import { formatMoney, nightsBetween } from "../../../utils/format";
import { rangeText, stayText } from "../../../utils/adminFormat";
import { useAsyncData } from "../../../utils/useAsyncData";
import { useDocumentTitle } from "../../../utils/useDocumentTitle";
import { PHONE_QUERY, useMedia } from "../../../utils/useMedia";
import { useDismiss } from "../../../layout/admin/useDismiss";
import BookingDrawer from "./BookingDrawer";
import { CollectDialog, RefundDialog } from "./PaymentDialogs";
import WalkInDrawer from "./WalkInDrawer";
import { paymentActionFor } from "./orderLabels";

const PAGE_SIZE = 20;

// The tabs and what each asks the API for. "Confirmed" leaves out the
// guests staying tonight, who have their own tab.
const TABS = [
  { key: "all", params: {}, count: (c) => c.all },
  { key: "pending", params: { status: "pending" }, count: (c) => c.pending },
  { key: "confirmed", params: { status: "confirmed", stay: "not_in_house" }, count: (c) => c.confirmed - (c.in_house || 0) },
  { key: "in_house", params: { stay: "in_house" }, count: (c) => c.in_house },
  { key: "completed", params: { status: "completed" }, count: (c) => c.completed },
  { key: "cancelled", params: { status: "cancelled" }, count: (c) => c.cancelled },
  { key: "refund", params: { payment_status: "refund_pending" }, count: (c) => c.refund_pending },
];

function readQuery(params) {
  const tab = TABS.find((item) => item.key === params.get("tab")) || TABS[0];
  return {
    tab,
    q: params.get("q") || "",
    page: Math.max(1, Number(params.get("page")) || 1),
    from: params.get("from") || "",
    to: params.get("to") || "",
    type: params.get("type") || "",
    channel: ["desk", "online"].includes(params.get("channel")) ? params.get("channel") : "",
  };
}

function Channel({ order }) {
  const { t } = useTranslation("orders");
  if (order.guest_name) return t("channel.desk");
  return order.paid_via ? `${t("channel.online")} · ${t(`provider.${order.paid_via}`, { defaultValue: order.paid_via })}` : t("channel.online");
}

// The dates filter: bookings whose stay lies within two dates.
function DatesChip({ from, to, onChange }) {
  const { t, i18n } = useTranslation("orders");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ from, to });
  const box = useRef(null);
  const button = useRef(null);
  useDismiss(box, open, () => setOpen(false), button);
  const label = from && to ? rangeText(from, to, i18n.language) : from ? `≥ ${rangeText(from, from, i18n.language)}` : to ? `≤ ${rangeText(to, to, i18n.language)}` : t("filters.anyDates");

  return (
    <div className="ax-dd-anchor" ref={box}>
      <button
        ref={button}
        type="button"
        className="ax-chip"
        aria-pressed={Boolean(from || to)}
        aria-expanded={open}
        onClick={() => {
          setDraft({ from, to });
          setOpen((v) => !v);
        }}
        data-testid="filter-dates"
      >
        <AxIcon name="calendar" small />
        {t("filters.dates")}: {label}
        <AxIcon name="chevronDown" small />
      </button>
      {open && (
        <div className="ax-card ax-range ax-range--left" role="dialog" aria-label={t("filters.dates")}>
          <p className="ax-note">{t("filters.datesHelp")}</p>
          <div className="ax-range__row">
            <label className="fx-field">
              <span className="fx-label-row">{t("filters.from")}</span>
              <span className="fx-control"><input type="date" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} autoFocus /></span>
            </label>
            <label className="fx-field">
              <span className="fx-label-row">{t("filters.to")}</span>
              <span className="fx-control"><input type="date" value={draft.to} min={draft.from || undefined} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} /></span>
            </label>
          </div>
          <div className="ax-range__foot">
            <button type="button" className="g-btn g-btn--outline g-btn--small" onClick={() => { setOpen(false); onChange({ from: "", to: "" }); }}>
              {t("filters.clearDates")}
            </button>
            <button type="button" className="g-btn g-btn--primary g-btn--small" disabled={Boolean(draft.from && draft.to && draft.to < draft.from)} onClick={() => { setOpen(false); onChange(draft); }}>
              {t("filters.apply")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Pager({ data, onPage }) {
  const { t } = useTranslation("orders");
  const { page, totalPages, total, limit } = data;
  const first = total ? (page - 1) * limit + 1 : 0;
  const last = Math.min(total, page * limit);
  const pages = [];
  for (let p = 1; p <= totalPages; p += 1) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= 1) pages.push(p);
    else if (pages.at(-1) !== "…") pages.push("…");
  }
  return (
    <nav className="ax-pager" aria-label={t("pager.label")} data-testid="orders-pagination">
      <span>
        {t("pager.showing")} <b>{first}–{last}</b> {t("pager.of", { count: total })}
      </span>
      <ul className="ax-pages">
        <li>
          <button type="button" className="ax-page ax-page--nav" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t("pager.previous")}</button>
        </li>
        {pages.map((p, i) => (
          <li key={`${p}-${i}`}>
            {p === "…" ? (
              <span className="ax-page ax-page--gap" aria-hidden="true">…</span>
            ) : (
              <button type="button" className="ax-page" aria-current={p === page ? "page" : undefined} aria-label={t("pager.page", { page: p })} onClick={() => onPage(p)}>
                {p}
              </button>
            )}
          </li>
        ))}
        <li>
          <button type="button" className="ax-page ax-page--nav" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>{t("pager.next")}</button>
        </li>
      </ul>
    </nav>
  );
}

// Admin: every booking, one page at a time from the server, by state, with
// search and filters; a booking opens in a panel with its actions (money
// taken at the desk, refund sent, confirm, complete, cancel, receipt, and
// delete when no money has moved). Desk bookings are entered from here.
export default function OrdersPage() {
  const { t, i18n } = useTranslation("orders");
  const lang = i18n.language;
  const toast = useToast();
  const phone = useMedia(PHONE_QUERY);
  const { clearNewBookingCount, refreshCounts } = useBookingNotifications();
  const [params, setParams] = useSearchParams();
  const query = readQuery(params);
  const [text, setText] = useState(query.q);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // { kind: collect | refund | delete | cancel, booking }
  const today = localDateString();
  useDocumentTitle(t("title"));

  // Opening the page counts as having seen the new bookings.
  useEffect(() => {
    clearNewBookingCount();
  }, [clearNewBookingCount]);

  const update = (changes, { keepPage = false } = {}) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, String(value)) : next.delete(key)));
      if (!keepPage) next.delete("page");
      return next;
    }, { replace: true });
  };

  // The search box waits for a pause in typing.
  useEffect(() => {
    if (text.trim() === query.q) return undefined;
    const timer = setTimeout(() => update({ q: text.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // A search from the top bar changes the address while this page is open.
  const [seenQ, setSeenQ] = useState(query.q);
  if (seenQ !== query.q) {
    setSeenQ(query.q);
    if (text.trim() !== query.q) setText(query.q);
  }

  const apiParams = {
    page: query.page,
    limit: PAGE_SIZE,
    ...query.tab.params,
    ...(query.q && { q: query.q }),
    ...(query.from && { from: query.from }),
    ...(query.to && { to: query.to }),
    ...(query.type && { room_type: query.type }),
    ...(query.channel && { channel: query.channel }),
  };
  const list = useAsyncData(`orders:${JSON.stringify(apiParams)}:${version}`, () => getBookings(apiParams).then((res) => res.data));
  const counts = useAsyncData(`orders-counts:${version}`, getBookingCounts);
  const types = useAsyncData("orders-types", getRoomTypes);
  const orders = list.data?.data || [];
  const filtered = Boolean(query.q || query.from || query.to || query.type || query.channel);
  const needsAction = counts.data ? (counts.data.pending || 0) + (counts.data.refund_pending || 0) : null;

  const openId = Number(params.get("booking")) || null;
  const walkIn = params.get("new") === "desk";

  const changed = () => {
    setVersion((v) => v + 1);
    refreshCounts();
  };

  const act = async (work, success) => {
    setBusy(true);
    try {
      const result = await work();
      toast.success(typeof success === "function" ? success(result) : success);
      changed();
      return true;
    } catch (err) {
      toast.error(apiErrorText(err, "orders:actionFailed"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onAction = (kind, booking) => {
    if (kind === "receipt") {
      setBusy(true);
      downloadBookingReceipt(booking.id, lang)
        .catch((err) => toast.error(apiErrorText(err, "orders:receiptFailed")))
        .finally(() => setBusy(false));
      return;
    }
    if (kind === "confirm" || kind === "complete") {
      const status = kind === "confirm" ? "confirmed" : "completed";
      act(() => updateBooking(booking.id, status), t(kind === "confirm" ? "toast.confirmed" : "toast.completed", { code: bookingCode(booking.id) }));
      return;
    }
    setPending({ kind, booking });
  };

  const confirmPending = async () => {
    const { kind, booking } = pending;
    const code = bookingCode(booking.id);
    let ok = false;
    if (kind === "collect") {
      ok = await act(() => markBookingPaid(booking.id), t("toast.paidAmount", { amount: formatMoney(booking.total_price, lang), code }));
    } else if (kind === "refund") {
      ok = await act(() => confirmRefund(booking.id), t("toast.refundedCode", { code }));
    } else if (kind === "cancel") {
      ok = await act(
        () => updateBooking(booking.id, "cancelled"),
        (res) => (res.data?.booking?.payment_status === "refund_pending" ? t("toast.cancelledRefund") : t("toast.cancelled", { code }))
      );
    } else if (kind === "delete") {
      ok = await act(() => deleteBooking(booking.id), t("toast.deleted", { code }));
      if (ok) update({ booking: "" }, { keepPage: true });
    }
    if (ok || kind !== "delete") setPending(null);
  };

  const openBooking = (booking) => update({ booking: booking.id }, { keepPage: true });
  const rowAction = (order) => {
    const action = paymentActionFor(order);
    if (action === "markPaid") return { label: t("paymentAction.markPaid"), run: () => setPending({ kind: "collect", booking: order }), strong: true };
    if (action === "refund") return { label: t("paymentAction.refund"), run: () => setPending({ kind: "refund", booking: order }), strong: true };
    return { label: t("row.details"), run: () => openBooking(order) };
  };

  const subtitle = list.data
    ? [t("head.count", { count: list.data.total }), needsAction ? t("head.needs", { count: needsAction }) : null].filter(Boolean).join(" · ")
    : t("head.loading");

  const tabCount = (tab) => (counts.data ? Math.max(0, tab.count(counts.data) || 0) : null);

  let content;
  if (list.error && !list.data) {
    content = (
      <EmptyState
        error
        icon="alert"
        title={t("states.errorTitle")}
        actions={<button type="button" className="g-btn g-btn--primary" onClick={list.reload}>{t("states.reload")}</button>}
        testId="orders-error"
      >
        {apiErrorText(list.error, "admin:loadFailed")}
      </EmptyState>
    );
  } else if (!list.data) {
    content = (
      <div className="ax-skelrows" aria-busy="true" data-testid="orders-loading">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="ax-skelrow">
            <Skel width={32} height={32} style={{ borderRadius: "50%" }} />
            <Skel variant="text" width={180} />
            <Skel variant="text" width={160} />
            <Skel variant="text" width={110} />
            <Skel variant="text" width={100} style={{ marginLeft: "auto" }} />
            <Skel width={96} height={24} />
          </div>
        ))}
      </div>
    );
  } else if (orders.length === 0) {
    content = (
      <EmptyState
        icon={filtered ? "search" : "bookings"}
        title={query.q ? t("states.noMatch", { term: query.q }) : filtered || query.tab.key !== "all" ? t("states.noneHere") : t("states.none")}
        actions={
          <>
            {filtered && (
              <button type="button" className="g-btn g-btn--outline" onClick={() => { setText(""); update({ q: "", from: "", to: "", type: "", channel: "" }); }}>
                {t("states.clear")}
              </button>
            )}
            <button type="button" className="g-btn g-btn--primary" onClick={() => update({ new: "desk" }, { keepPage: true })}>
              {t("walkInButton")}
            </button>
          </>
        }
        testId="orders-empty"
      >
        {filtered ? t("states.noMatchHelp") : t("states.noneHelp")}
      </EmptyState>
    );
  } else if (phone) {
    content = (
      <div className="ax-ocards" data-testid="orders-cards">
        {orders.map((order) => (
          <OrderCard key={order.id} booking={order} today={today} onOpen={openBooking} />
        ))}
      </div>
    );
  } else {
    content = (
      <table className="ax-table" data-testid="orders-table">
        <thead>
          <tr>
            <th scope="col">{t("columns.guest")}</th>
            <th scope="col">{t("columns.room")}</th>
            <th scope="col">{t("columns.stay")}</th>
            <th scope="col">{t("columns.channel")}</th>
            <th scope="col" className="is-num">{t("columns.total")}</th>
            <th scope="col">{t("columns.status")}</th>
            <th scope="col">{t("columns.action")}</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const action = rowAction(order);
            return (
              <tr key={order.id} aria-selected={openId === order.id || undefined} data-testid="order-row">
                <td>
                  <div className="ax-person">
                    <span className="ax-avatar" aria-hidden="true">{initials(order.guest_name || order.user_name)}</span>
                    <div>
                      <button type="button" className="ax-rowlink" onClick={() => openBooking(order)}>
                        <b>{order.guest_name || order.user_name}</b>
                      </button>
                      <div className="ax-code">{bookingCode(order.id)}</div>
                    </div>
                  </div>
                </td>
                <td>
                  {order.room_name}
                  <div className="ax-sub">{order.room_type}</div>
                </td>
                <td>
                  {stayText(order.check_in, order.check_out, lang)}
                  <div className="ax-sub">{t("admin:card.nights", { count: nightsBetween(order.check_in, order.check_out) })}</div>
                </td>
                <td><Channel order={order} /></td>
                <td className="is-num">{formatMoney(order.total_price, lang)}</td>
                <td><BookingBadge booking={order} today={today} /></td>
                <td>
                  <button type="button" className={`g-btn g-btn--small ax-btn-sm ${action.strong ? "g-btn--outline" : "ax-btn-ghost"}`} onClick={action.run} data-testid="row-action">
                    {action.label}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <div className="ax-screen" data-testid="orders-page">
      <div className="ax-head">
        <div>
          <Crumbs current={t("title")} />
          <h1>{t("title")}</h1>
          <p>{subtitle}</p>
        </div>
        <div className="ax-actions ax-hidephone">
          <button type="button" className="g-btn g-btn--primary" onClick={() => update({ new: "desk" }, { keepPage: true })} data-testid="walk-in-open">
            <AxIcon name="plus" small />
            {t("walkInButton")}
          </button>
        </div>
      </div>

      <div className={phone ? "ax-chiprow" : "ax-tabs"} role="tablist" aria-label={t("tabs.label")}>
        {TABS.map((tab) => {
          const count = tabCount(tab);
          const selected = tab.key === query.tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              className={phone ? "ax-chip ax-chip--sm" : "ax-tab"}
              onClick={() => update({ tab: tab.key === "all" ? "" : tab.key })}
              data-testid={`tab-${tab.key}`}
            >
              {t(`tabs.${tab.key}`)}
              {count !== null && (phone ? ` · ${count}` : <span className="ax-tab__n">{count}</span>)}
            </button>
          );
        })}
      </div>

      <section className="ax-tablewrap" aria-label={t("listLabel")} aria-busy={list.loading}>
        <div className="ax-tablebar">
          <div className="fx-control ax-tsearch">
            <AxIcon name="search" />
            <input type="search" aria-label={t("filters.search")} placeholder={t("filters.searchPlaceholder")} value={text} onChange={(e) => setText(e.target.value)} data-testid="orders-search" />
          </div>
          <DatesChip from={query.from} to={query.to} onChange={({ from, to }) => update({ from, to })} />
          <label className="ax-chip" data-active={Boolean(query.type) || undefined}>
            <span className="sr-only">{t("filters.type")}</span>
            <select value={query.type} onChange={(e) => update({ type: e.target.value })} data-testid="filter-type">
              <option value="">{t("filters.anyType")}</option>
              {(types.data || []).map((type) => (
                <option key={type.type} value={type.type}>{type.type}</option>
              ))}
            </select>
          </label>
          <label className="ax-chip" data-active={Boolean(query.channel) || undefined}>
            <span className="sr-only">{t("filters.channel")}</span>
            <select value={query.channel} onChange={(e) => update({ channel: e.target.value })} data-testid="filter-channel">
              <option value="">{t("filters.anyChannel")}</option>
              <option value="online">{t("filters.channelOnline")}</option>
              <option value="desk">{t("filters.channelDesk")}</option>
            </select>
          </label>
        </div>
        {list.error && list.data && <p className="ax-alert" role="alert">{apiErrorText(list.error, "admin:loadFailed")}</p>}
        <div className={phone ? "ax-tablebody ax-tablebody--cards" : "ax-tablebody"}>{content}</div>
        {list.data && orders.length > 0 && <Pager data={list.data} onPage={(page) => update({ page }, { keepPage: true })} />}
      </section>

      <button type="button" className="g-btn g-btn--primary ax-fab" onClick={() => update({ new: "desk" }, { keepPage: true })}>
        <AxIcon name="plus" small />
        {t("walkInShort")}
      </button>

      {openId && (
        <BookingDrawer
          id={openId}
          version={version}
          today={today}
          siblings={orders.map((order) => order.id)}
          busy={busy}
          onStep={(id) => update({ booking: id }, { keepPage: true })}
          onClose={() => update({ booking: "" }, { keepPage: true })}
          onAction={onAction}
        />
      )}

      {walkIn && (
        <WalkInDrawer
          onClose={() => update({ new: "" }, { keepPage: true })}
          onCreated={(booking) => {
            toast.success(t("toast.walkInCreated", { code: bookingCode(booking.id) }));
            changed();
            update({ new: "", booking: booking.id, tab: "", q: "", from: "", to: "", type: "", channel: "" });
            setText("");
          }}
        />
      )}

      {pending?.kind === "collect" && <CollectDialog booking={pending.booking} busy={busy} onConfirm={confirmPending} onClose={() => setPending(null)} />}
      {pending?.kind === "refund" && <RefundDialog booking={pending.booking} busy={busy} onConfirm={confirmPending} onClose={() => setPending(null)} />}
      <ConfirmModal
        open={pending?.kind === "cancel" || pending?.kind === "delete"}
        title={pending ? t(`confirm.${pending.kind}Title`, { code: bookingCode(pending.booking.id) }) : ""}
        message={pending ? t(`confirm.${pending.kind}Message`, { code: bookingCode(pending.booking.id) }) : ""}
        confirmLabel={pending ? t(`confirm.${pending.kind}Action`) : ""}
        cancelLabel={pending?.kind === "cancel" ? t("confirm.keep") : undefined}
        tone="danger"
        // Deleting a booking cannot be undone: type its code first.
        confirmCode={pending?.kind === "delete" ? bookingRef(pending.booking.id) : undefined}
        loading={busy}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
