import { useTranslation } from "react-i18next";
import { Badge, SkeletonRows } from "../../../components/admin/ui";
import { formatDate, formatMoney } from "../../../utils/format";
import useIsMobile from "../../../utils/useIsMobile";
import { PAYMENT_TONE, STATUS_TONE, STATUS_TRANSITIONS, paymentActionFor } from "./orderLabels";
import { bookingCode } from "../../../utils/bookingCode";

function StatusSelect({ order, busy, onChange }) {
  const { t } = useTranslation("orders");
  const next = STATUS_TRANSITIONS[order.status] || [];
  if (next.length === 0) return <Badge tone={STATUS_TONE[order.status]}>{t(`status.${order.status}`)}</Badge>;
  return (
    <select
      className={`adm-select adm-select--inline adm-badge--${STATUS_TONE[order.status]}`}
      style={{ fontWeight: 700, fontSize: 13, padding: "6px 10px" }}
      value={order.status}
      disabled={busy}
      onChange={(event) => onChange(order, event.target.value)}
      aria-label={t("columns.status")}
    >
      {[order.status, ...next].map((status) => (
        <option key={status} value={status}>
          {t(`status.${status}`)}
        </option>
      ))}
    </select>
  );
}

function Payment({ order, busy, onAction }) {
  const { t } = useTranslation("orders");
  const payment = order.payment_status || "unpaid";
  const action = paymentActionFor(order);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
      <Badge tone={PAYMENT_TONE[payment]}>{t(`payment.${payment}`, { defaultValue: payment })}</Badge>
      {payment === "refund_pending" && order.refund_reason && <span className="adm-cell-sub" style={{ maxWidth: 220 }}>{t(`refundReason.${order.refund_reason}`)}</span>}
      {action && (
        <button type="button" className="adm-btn adm-btn--ghost adm-btn--small" disabled={busy} onClick={() => onAction(order, action)}>
          {t(`paymentAction.${action}`)}
        </button>
      )}
    </div>
  );
}

function Guest({ order }) {
  const { t } = useTranslation("orders");
  return (
    <>
      <div style={{ color: "var(--color-text-primary)" }}>{order.guest_name || order.user_name}</div>
      <div className="adm-cell-sub">
        {order.guest_name ? [order.guest_phone, order.guest_email, t("atDesk")].filter(Boolean).join(" · ") : order.user_email}
      </div>
    </>
  );
}

// One page of bookings: a table on wide screens, cards on phones.
export default function OrdersTable({ orders, loading, busy, onStatus, onPayment, onReceipt, onDelete }) {
  const { t, i18n } = useTranslation("orders");
  const isMobile = useIsMobile();
  const lang = i18n.language;

  const actions = (order) => (
    <>
      <button type="button" className="adm-btn adm-btn--ghost adm-btn--small" onClick={() => onReceipt(order)} disabled={busy.receipt === order.id} data-testid="order-receipt">
        {busy.receipt === order.id ? "…" : t("actions.pdf")}
      </button>
      <button type="button" className="adm-btn adm-btn--muted adm-btn--small" style={{ color: "var(--color-danger)" }} onClick={() => onDelete(order)} disabled={busy.delete === order.id}>
        {t("admin:delete")}
      </button>
    </>
  );

  if (isMobile) {
    if (loading) return <div className="adm-cards"><div className="luxe-skeleton" style={{ height: 140 }} /></div>;
    return (
      <div className="adm-cards">
        {orders.map((order) => (
          <div key={order.id} className="adm-card">
            <div className="adm-card-row">
              <strong style={{ color: "var(--color-text-primary)" }}>{bookingCode(order.id)}</strong>
              <StatusSelect order={order} busy={busy.status === order.id} onChange={onStatus} />
            </div>
            <div><Guest order={order} /></div>
            <div style={{ color: "var(--color-text-secondary)" }}>
              {order.room_name} <span className="adm-muted">· {order.room_type}</span>
            </div>
            <div className="adm-card-row">
              <span>{formatDate(String(order.check_in).slice(0, 10), lang)} → {formatDate(String(order.check_out).slice(0, 10), lang)}</span>
              <strong style={{ color: "var(--color-text-primary)" }}>{formatMoney(order.total_price, lang)}</strong>
            </div>
            <Payment order={order} busy={busy.payment === order.id} onAction={onPayment} />
            <div className="adm-card-actions">{actions(order)}</div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="adm-table-wrap">
      <table className="adm-table" style={{ minWidth: 980 }} data-testid="orders-table">
        <thead>
          <tr>
            <th>{t("columns.code")}</th>
            <th>{t("columns.guest")}</th>
            <th>{t("columns.room")}</th>
            <th>{t("columns.checkIn")}</th>
            <th>{t("columns.checkOut")}</th>
            <th>{t("columns.status")}</th>
            <th>{t("columns.amount")}</th>
            <th className="is-right">{t("columns.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <SkeletonRows rows={6} columns={8} />
          ) : (
            orders.map((order) => (
              <tr key={order.id}>
                <td className="is-strong" style={{ whiteSpace: "nowrap" }}>{bookingCode(order.id)}</td>
                <td><Guest order={order} /></td>
                <td>
                  <div style={{ color: "var(--color-text-primary)" }}>{order.room_name}</div>
                  <div className="adm-cell-sub">{order.room_type}</div>
                </td>
                <td>{formatDate(String(order.check_in).slice(0, 10), lang)}</td>
                <td>{formatDate(String(order.check_out).slice(0, 10), lang)}</td>
                <td><StatusSelect order={order} busy={busy.status === order.id} onChange={onStatus} /></td>
                <td>
                  <div className="is-strong" style={{ marginBottom: 6, color: "var(--color-text-primary)" }}>{formatMoney(order.total_price, lang)}</div>
                  <Payment order={order} busy={busy.payment === order.id} onAction={onPayment} />
                </td>
                <td className="is-right"><div className="adm-row-actions">{actions(order)}</div></td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
