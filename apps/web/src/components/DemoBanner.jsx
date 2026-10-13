import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useProperty } from "../context/PropertyContext";
import { CloseIcon } from "./Dialog";

const STORAGE_KEY = "luxestay_demo_banner_hidden";
// Closing the strip elsewhere does not hide the sample sign-ins.
const SIGN_IN_STORAGE_KEY = "luxestay_demo_sign_in_hidden";

// Closed for this tab's session only: a new tab shows it again.
function wasClosed(key) {
  try {
    return window.sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

// The strip across the top of a public demo (DEMO_MODE=true on the API; it
// renders nothing otherwise). It sits above the header and pushes the page
// down. "No real money" is only said when the API reports that every payment
// gateway is a test one: demo mode does not replace the gateways.
// On the sign-in pages (`signIn`) it gives the sample sign-ins instead, as
// the API lists them (the seeded accounts, never written here).
export default function DemoBanner({ admin = false, signIn = false }) {
  const { t } = useTranslation("common");
  const { demo } = useProperty();
  const { pathname } = useLocation();
  const storageKey = signIn ? SIGN_IN_STORAGE_KEY : STORAGE_KEY;
  const [closed, setClosed] = useState(() => wasClosed(storageKey));

  if (!demo || closed) return null;

  const close = () => {
    try {
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      // Stays closed until the page is reloaded.
    }
    setClosed(true);
  };

  const adminText = demo.resetIntervalHours
    ? t("admin:demo.bannerTimed", { hours: demo.resetIntervalHours })
    : t("admin:demo.banner");
  const guestText = demo.testPayments ? t("demo.guestTestPayments") : t("demo.guest");
  // The checkout and the gateway's return page.
  const onPaymentPage = pathname.startsWith("/payment") || pathname.endsWith("/book");

  if (signIn && demo.accounts?.length) {
    return (
      <div className="demo-banner demo-banner--sign-in" role="note" data-testid="demo-banner">
        <span className="demo-banner-tag">{t("demo.tag")}</span>
        <span data-testid="demo-accounts">
          {t("demo.signInWith")}{" "}
          {demo.accounts.map((account, index) => (
            <span key={account.email} className="demo-banner-account">
              {index > 0 && " · "}
              {t(`demo.role.${account.role}`, { defaultValue: account.role })}: <b>{account.email}</b> / <b>{account.password}</b>
            </span>
          ))}
        </span>
        <button type="button" aria-label={t("demo.close")} onClick={close}>
          <CloseIcon />
        </button>
      </div>
    );
  }

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
