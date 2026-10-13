import { useCallback, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import AxIcon from "../../components/admin/AxIcon";
import BookingBadge from "../../components/admin/BookingBadge";
import { useBookingNotifications } from "../../context/BookingNotificationsContext";
import { bookingCode } from "../../utils/bookingCode";
import { formatDate, formatMoney } from "../../utils/format";
import { localDateString } from "../../utils/date";
import { useDismiss } from "./useDismiss";

const ICON = { created: "receipt", refund: "refund", duplicate: "alert" };

function ago(at, now, lang) {
  const minutes = Math.max(0, Math.round((now - at) / 60000));
  const format = new Intl.RelativeTimeFormat(lang === "en" ? "en" : "vi", { numeric: "auto", style: "short" });
  if (minutes < 60) return format.format(-minutes, "minute");
  return format.format(-Math.round(minutes / 60), "hour");
}

// The bell: what happened during this session (new bookings, refunds to
// send, a payment taken twice), as the API announced it live. Opening an
// entry opens that booking in the orders list.
export default function NotificationsMenu({ testId = "notifications" }) {
  const { t, i18n } = useTranslation("admin");
  const navigate = useNavigate();
  const { notifications, unreadCount, markAllRead, markRead } = useBookingNotifications();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);
  const box = useRef(null);
  const button = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(box, open, close, button);

  const lang = i18n.language;
  const today = localDateString();
  const label = unreadCount ? t("notifications.labelUnread", { count: unreadCount }) : t("notifications.label");

  const subtitle = (item) => {
    const b = item.booking;
    if (item.kind === "duplicate") return t("notifications.duplicateSub", { ref: b.transaction_ref, amount: formatMoney(b.total_price, lang) });
    if (item.kind === "refund") return [b.guest_name, t("notifications.refundAmount", { amount: formatMoney(b.total_price, lang) })].filter(Boolean).join(" · ");
    const dates = b.check_in && b.check_out ? `${formatDate(b.check_in, lang)} – ${formatDate(b.check_out, lang)}` : "";
    return [b.guest_name, dates, formatMoney(b.total_price, lang)].filter(Boolean).join(" · ");
  };

  return (
    <div ref={box} className="ax-dd-anchor">
      <button
        ref={button}
        type="button"
        className="ax-iconbtn"
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setNow(Date.now());
          setOpen((value) => !value);
        }}
        data-testid={`${testId}-button`}
      >
        <AxIcon name="bell" />
        {unreadCount > 0 && <span className="ax-badge-n" aria-hidden="true">{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>

      {open && (
        <div className="ax-dd ax-dd--notif" role="dialog" aria-label={t("notifications.title")} data-testid={testId}>
          <div className="ax-dd__head">
            <b>{t("notifications.title")}</b>
            {unreadCount > 0 && (
              <button type="button" className="g-btn g-btn--link ax-linkbtn" onClick={markAllRead}>
                {t("notifications.markRead")}
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="ax-dd__empty">{t("notifications.empty")}</p>
          ) : (
            <ul className="ax-nlist">
              {notifications.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    className={`ax-nitem${item.read ? "" : " is-unread"}`}
                    onClick={() => {
                      markRead(item.key);
                      setOpen(false);
                      navigate(`/admin/orders?booking=${item.booking.id}`);
                    }}
                  >
                    <span className="ax-nitem__ic"><AxIcon name={ICON[item.kind]} /></span>
                    <span>
                      <span className="ax-nitem__t">
                        {t(`notifications.kind.${item.kind}`, { code: bookingCode(item.booking.id), room: item.booking.room_name || "" })}
                      </span>
                      <span className="ax-nitem__s">{subtitle(item)}</span>
                      {item.booking.status && (
                        <span className="ax-nitem__b">
                          <BookingBadge booking={item.booking} today={today} />
                        </span>
                      )}
                    </span>
                    <span className="ax-nitem__time">{ago(item.at, now, lang)}</span>
                    {!item.read && <span className="sr-only">{t("notifications.unread")}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="ax-dd__foot">
            <Link className="g-btn g-btn--link ax-linkbtn" to="/admin/orders" onClick={() => setOpen(false)}>
              {t("notifications.allBookings")}
            </Link>
            <span className="ax-muted ax-dd__note">{t("notifications.sessionOnly")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
