import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useProperty } from "../context/PropertyContext";
import { CloseIcon } from "./Dialog";

const STORAGE_KEY = "luxestay_demo_banner_hidden";

// Closed for this tab's session only: a new tab shows it again.
function wasClosed() {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

// The strip across the top of a public demo (DEMO_MODE=true on the API; it
// renders nothing otherwise). It sits above the header and pushes the page
// down. "No real money" is only said when the API reports that every payment
// gateway is a test one: demo mode does not replace the gateways.
export default function DemoBanner({ admin = false }) {
  const { t } = useTranslation("common");
  const { demo } = useProperty();
  const { pathname } = useLocation();
  const [closed, setClosed] = useState(wasClosed);

  if (!demo || closed) return null;

  const close = () => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Stays closed until the page is reloaded.
    }
    setClosed(true);
  };

  const adminText = demo.resetIntervalHours
    ? t("admin:demo.bannerTimed", { hours: demo.resetIntervalHours })
    : t("admin:demo.banner");
  const guestText = demo.testPayments ? t("demo.guestTestPayments") : t("demo.guest");
  const onPaymentPage = pathname.startsWith("/payment");

  return (
    <div className={`demo-banner${admin ? " demo-banner--admin" : ""}`} role="note" data-testid="demo-banner">
      <span className="demo-banner-tag">{t("demo.tag")}</span>
      <span className="demo-banner-long">
        {admin ? adminText : guestText}
        {demo.testPayments && onPaymentPage && ` ${t("demo.noRealMoney")}`}
      </span>
      <span className="demo-banner-short">
        {demo.testPayments && onPaymentPage ? t("demo.noRealMoney") : demo.testPayments ? t("demo.shortTestPayments") : t("demo.short")}
      </span>
      <button type="button" aria-label={t("demo.close")} onClick={close}>
        <CloseIcon />
      </button>
    </div>
  );
}

// The same reassurance next to the pay buttons themselves (the payment step
// after booking, the pay dialog in "My bookings").
export function DemoPaymentNote() {
  const { t } = useTranslation("common");
  const { demo } = useProperty();
  if (!demo?.testPayments) return null;
  return <p className="g-note" style={{ margin: 0 }} data-testid="demo-payment-note">{t("demo.noRealMoney")}</p>;
}
