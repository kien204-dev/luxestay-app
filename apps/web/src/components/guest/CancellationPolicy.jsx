import { useTranslation } from "react-i18next";
import { addDays, formatDate, isDateString } from "../../utils/format";

// The property's cancellation and payment-hold rules, in plain words. Shown
// before the guest confirms a booking and again before they pay, so nobody
// learns the rules only after money has moved.
export default function CancellationPolicy({ policy, checkIn }) {
  const { t, i18n } = useTranslation("site");

  if (!policy) return null;

  const days = Number(policy.freeCancellationDays) || 0;
  const deadline = isDateString(checkIn) ? addDays(checkIn, -days) : null;
  // Already past the deadline when booking this close to check-in.
  const windowClosed = deadline !== null && deadline < policy.today;

  return (
    <div className="g-note" data-testid="cancellation-policy">
      <strong>{t("policy.title")}</strong>
      <ul>
        <li>{t("policy.hold", { count: policy.pendingBookingTtlMinutes })}</li>
        <li>{t("policy.unpaid")}</li>
        <li>
          {windowClosed
            ? t("policy.paidClosed", { count: days })
            : deadline
              ? t("policy.paidUntil", { count: days, date: formatDate(deadline, i18n.language) })
              : t("policy.paid", { count: days })}
        </li>
      </ul>
    </div>
  );
}
