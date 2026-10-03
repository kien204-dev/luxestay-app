import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import StatusCard from "../components/guest/StatusCard";
import { getPaymentByTransactionRef } from "../services/paymentService";
import { apiErrorText } from "../utils/apiError";
import { bookingCode } from "./admin/orders/orderLabels";
import { useDocumentTitle } from "../utils/useDocumentTitle";

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 15;

// VNPay uses vnp_TxnRef, MoMo uses orderId — both are our own transaction_ref.
function transactionRefOf(searchParams) {
  return searchParams.get("vnp_TxnRef") || searchParams.get("orderId") || "";
}

// Where the payment gateway sends the guest back. The gateway's own redirect
// is not trusted: the page asks the API (which only believes the gateway's
// signed server-to-server notice) until the payment is settled.
export default function PaymentResult() {
  const { t } = useTranslation("site");
  useDocumentTitle(t("payment.result.documentTitle"));
  const [searchParams] = useSearchParams();
  const transactionRef = transactionRefOf(searchParams);
  const [state, setState] = useState({ payment: null, bookingPaymentStatus: null, error: "", polls: 0 });

  useEffect(() => {
    if (!transactionRef) return undefined;
    let cancelled = false;
    let timer;
    let attempts = 0;

    const poll = async () => {
      try {
        const res = await getPaymentByTransactionRef(transactionRef);
        if (cancelled) return;
        const { payment, bookingPaymentStatus } = res.data;
        const again = payment.status === "pending" && attempts < MAX_POLLS;
        if (again) attempts += 1;
        setState({ payment, bookingPaymentStatus: bookingPaymentStatus || null, error: "", polls: attempts });
        if (again) timer = setTimeout(poll, POLL_INTERVAL_MS);
      } catch (err) {
        if (!cancelled) setState((current) => ({ ...current, error: apiErrorText(err, "site:payment.result.loadFailed") }));
      }
    };
    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [transactionRef]);

  const { payment, bookingPaymentStatus, error, polls } = state;
  const code = payment ? bookingCode(payment.booking_id) : "";
  let view;
  if (!transactionRef || error) view = { variant: "error", key: "unknown", text: error || t("payment.result.missingRef") };
  else if (!payment || (payment.status === "pending" && polls < MAX_POLLS)) view = { variant: "pending", key: "checking" };
  // The money came after the hold ran out and the room went to someone
  // else: do not tell the guest they have a room.
  else if (payment.status === "success" && bookingPaymentStatus === "refund_pending") view = { variant: "pending", key: "refund" };
  else if (payment.status === "success") view = { variant: "success", key: "success" };
  else if (payment.status === "pending") view = { variant: "pending", key: "slow" };
  else view = { variant: "error", key: "failed" };

  return (
    <StatusCard
      variant={view.variant}
      title={t(`payment.result.${view.key}.title`)}
      testId={`payment-result-${view.key}`}
      action={<Link to="/my-bookings" className="g-btn g-btn--primary g-btn--block">{t("payment.result.toMyBookings")}</Link>}
    >
      {view.text || t(`payment.result.${view.key}.text`, { code })}
    </StatusCard>
  );
}
