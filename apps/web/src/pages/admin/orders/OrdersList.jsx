import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Pagination } from "../../../components/admin/ui";
import ConfirmModal from "../../../components/ConfirmModal";
import { useToast } from "../../../context/ToastContext";
import { confirmRefund, deleteBooking, downloadBookingReceipt, getBookings, markBookingPaid, updateBooking } from "../../../services/bookingService";
import { apiErrorText } from "../../../utils/apiError";
import { useAsyncData } from "../../../utils/useAsyncData";
import { BOOKING_STATUSES, PAYMENT_STATUSES } from "./orderLabels";
import { bookingCode, bookingRef } from "../../../utils/bookingCode";
import OrdersTable from "./OrdersTable";

const PAGE_SIZE = 20;

// The booking list, one page at a time from the server, with its status and
// payment actions. `refreshKey` changes when something outside (a desk
// booking) added a booking; `onChanged` tells the page to refresh totals.
export default function OrdersList({ refreshKey, onChanged, onWalkIn }) {
  const { t, i18n } = useTranslation("orders");
  const toast = useToast();
  const [query, setQuery] = useState({ page: 1, status: "", payment: "" });
  const [busy, setBusy] = useState({});
  const [pending, setPending] = useState(null); // { kind: "delete" | "refund" | "markPaid", order }

  const params = { page: query.page, limit: PAGE_SIZE, ...(query.status && { status: query.status }), ...(query.payment && { payment_status: query.payment }) };
  const { data, loading, error, reload, setData } = useAsyncData(`orders:${JSON.stringify(params)}:${refreshKey}`, () => getBookings(params).then((res) => res.data));
  const orders = data?.data || [];
  const patch = (id, changes) =>
    setData((current) => (current ? { ...current, data: current.data.map((order) => (order.id === id ? { ...order, ...changes } : order)) } : current));
  const run = async (kind, id, work) => {
    setBusy((current) => ({ ...current, [kind]: id }));
    try {
      await work();
    } finally {
      setBusy((current) => ({ ...current, [kind]: null }));
    }
  };

  const changeStatus = (order, status) =>
    run("status", order.id, async () => {
      try {
        const saved = (await updateBooking(order.id, status)).data?.booking;
        patch(order.id, saved ? { status: saved.status, payment_status: saved.payment_status, refund_reason: saved.refund_reason } : { status });
        toast.success(saved?.payment_status === "refund_pending" ? t("toast.cancelledRefund") : t("toast.statusUpdated"));
        onChanged();
      } catch (err) {
        toast.error(apiErrorText(err, "orders:actionFailed"));
      }
    });

  const confirmPending = () => {
    const { kind, order } = pending;
    const busyKind = kind === "delete" ? "delete" : "payment";
    return run(busyKind, order.id, async () => {
      try {
        if (kind === "delete") {
          await deleteBooking(order.id);
          toast.success(t("toast.deleted", { code: bookingCode(order.id) }));
          reload();
        } else {
          const saved = (kind === "refund" ? await confirmRefund(order.id) : await markBookingPaid(order.id)).data.booking;
          patch(order.id, { status: saved.status, payment_status: saved.payment_status });
          toast.success(kind === "refund" ? t("toast.refunded") : t("toast.paid"));
        }
        onChanged();
      } catch (err) {
        toast.error(apiErrorText(err, "orders:actionFailed"));
      } finally {
        setPending(null);
      }
    });
  };

  const downloadReceipt = (order) =>
    run("receipt", order.id, async () => {
      try {
        await downloadBookingReceipt(order.id, i18n.language);
      } catch (err) {
        toast.error(apiErrorText(err, "orders:receiptFailed"));
      }
    });

  const filter = (changes) => setQuery((current) => ({ ...current, page: 1, ...changes }));

  return (
    <div className="adm-panel" style={{ overflow: "hidden" }}>
      <div className="adm-toolbar">
        <h2 className="adm-panel-title" style={{ margin: 0 }}>
          {t("listTitle")} <span className="adm-muted" style={{ fontSize: 14, fontFamily: "var(--font-sans)" }}>{t("matching", { count: data?.total ?? 0 })}</span>
        </h2>
        <div className="adm-filters">
          <select className="adm-select adm-select--inline" value={query.status} onChange={(e) => filter({ status: e.target.value })} aria-label={t("filters.status")}>
            <option value="">{t("filters.anyStatus")}</option>
            {BOOKING_STATUSES.map((status) => <option key={status} value={status}>{t(`status.${status}`)}</option>)}
          </select>
          <select className="adm-select adm-select--inline" value={query.payment} onChange={(e) => filter({ payment: e.target.value })} aria-label={t("filters.payment")}>
            <option value="">{t("filters.anyPayment")}</option>
            {PAYMENT_STATUSES.map((payment) => <option key={payment} value={payment}>{t(`payment.${payment}`)}</option>)}
          </select>
          <button type="button" className="adm-btn adm-btn--primary adm-btn--small" onClick={onWalkIn}>
            {t("walkIn")}
          </button>
        </div>
      </div>

      <Alert>{error ? apiErrorText(error, "admin:loadFailed") : ""}</Alert>

      {!loading && orders.length === 0 ? (
        <p className="adm-empty">{t("empty")}</p>
      ) : (
        <OrdersTable
          orders={orders}
          loading={loading && !data}
          busy={busy}
          onStatus={changeStatus}
          onPayment={(order, kind) => setPending({ kind, order })}
          onReceipt={downloadReceipt}
          onDelete={(order) => setPending({ kind: "delete", order })}
        />
      )}

      {data && (
        <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={PAGE_SIZE} onChange={(page) => setQuery((current) => ({ ...current, page }))} testId="orders-pagination" />
      )}

      <ConfirmModal
        open={Boolean(pending)}
        title={pending ? t(`confirm.${pending.kind}Title`) : ""}
        message={pending ? t(`confirm.${pending.kind}Message`, { code: bookingCode(pending.order.id) }) : ""}
        confirmLabel={pending ? t(`confirm.${pending.kind}Action`) : ""}
        tone={pending?.kind === "delete" ? "danger" : "default"}
        // Deleting a booking takes its payments and review with it.
        confirmCode={pending?.kind === "delete" ? bookingRef(pending.order.id) : undefined}
        loading={Boolean(pending) && (busy.delete === pending.order.id || busy.payment === pending.order.id)}
        onConfirm={confirmPending}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
