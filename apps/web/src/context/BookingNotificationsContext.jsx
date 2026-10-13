import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";
import { getSocket } from "../services/socket";
import { getBooking, getBookingCounts } from "../services/bookingService";
import i18n from "../i18n";
import { bookingCode } from "../utils/bookingCode";

const BookingNotificationsContext = createContext();

// The bell keeps the last few events of this session, newest first.
const MAX_NOTIFICATIONS = 20;

function formatBookingLabel(booking) {
  const code = bookingCode(booking.id);
  return booking.room_name ? `${code} — ${booking.room_name}` : code;
}

// What the admin area hears live from the API (socket.io), for an admin only:
//
//  - newBookingCount: +1 per booking:created while the admin isn't looking at
//    Orders, reset when Orders is opened (clearNewBookingCount).
//  - notifications: the events of this session for the bell in the top bar
//    (a new booking, a refund to send, a payment taken twice), unread until
//    the admin marks them read. Nothing is stored: a reload starts empty,
//    as the API keeps no notification history.
//  - counts: the booking counts from GET /bookings/counts, for the number
//    next to "Bookings" in the menu (waiting for payment + refunds to send).
//    Fetched on sign-in, after every event, and when a page that changed a
//    booking calls refreshCounts().
export function BookingNotificationsProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();
  const [newBookingCount, setNewBookingCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [counts, setCounts] = useState(null);
  const isAdmin = user?.role === "admin";

  const refreshCounts = useCallback(() => {
    getBookingCounts().then(setCounts, () => {});
  }, []);

  useEffect(() => {
    if (!isAdmin) return undefined;

    const socket = getSocket();
    socket.connect();
    refreshCounts();

    const add = (kind, booking) => {
      const entry = { key: `${kind}-${booking.id}-${Date.now()}`, kind, at: Date.now(), read: false, booking };
      setNotifications((list) => [entry, ...list].slice(0, MAX_NOTIFICATIONS));
      refreshCounts();
      // The event does not carry the guest's name; the booking does.
      getBooking(booking.id).then(
        (res) => {
          const full = res.data || {};
          setNotifications((list) =>
            list.map((item) =>
              item.key === entry.key
                ? {
                    ...item,
                    booking: {
                      ...item.booking,
                      guest_name: full.guest_name || full.user_name || "",
                      room_name: full.room_name || item.booking.room_name,
                      check_in: full.check_in || item.booking.check_in,
                      check_out: full.check_out || item.booking.check_out,
                      status: full.status || item.booking.status,
                      payment_status: full.payment_status,
                    },
                  }
                : item
            )
          );
        },
        () => {}
      );
    };

    const handleCreated = (booking) => {
      setNewBookingCount((count) => count + 1);
      add("created", booking);
      toast.info(i18n.t("admin:live.newBooking", { booking: formatBookingLabel(booking) }));
    };

    // Money that has to be sent back by hand: keep these on screen longer.
    const handleRefundPending = (booking) => {
      add("refund", booking);
      toast.error(i18n.t("admin:live.refundPending", { code: formatBookingLabel(booking) }));
    };
    const handleDuplicatePayment = (payment) => {
      add("duplicate", { id: payment.booking_id, total_price: payment.amount, transaction_ref: payment.transaction_ref });
      toast.error(
        i18n.t("admin:live.duplicatePayment", { code: formatBookingLabel({ id: payment.booking_id }), ref: payment.transaction_ref }),
        15000
      );
    };

    socket.on("booking:created", handleCreated);
    socket.on("booking:refund-pending", handleRefundPending);
    socket.on("payment:duplicate", handleDuplicatePayment);

    return () => {
      socket.off("booking:created", handleCreated);
      socket.off("booking:refund-pending", handleRefundPending);
      socket.off("payment:duplicate", handleDuplicatePayment);
      socket.disconnect();
    };
    // toast identity is stable (useMemo'd in ToastProvider); only the admin
    // role transition should re-run this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const clearNewBookingCount = useCallback(() => setNewBookingCount(0), []);
  const markAllRead = useCallback(() => setNotifications((list) => list.map((item) => (item.read ? item : { ...item, read: true }))), []);
  const markRead = useCallback((key) => setNotifications((list) => list.map((item) => (item.key === key ? { ...item, read: true } : item))), []);

  const value = useMemo(
    () => ({
      newBookingCount,
      clearNewBookingCount,
      notifications: isAdmin ? notifications : [],
      unreadCount: isAdmin ? notifications.filter((item) => !item.read).length : 0,
      markAllRead,
      markRead,
      counts: isAdmin ? counts : null,
      refreshCounts,
    }),
    [newBookingCount, clearNewBookingCount, notifications, isAdmin, markAllRead, markRead, counts, refreshCounts]
  );

  return <BookingNotificationsContext.Provider value={value}>{children}</BookingNotificationsContext.Provider>;
}

export function useBookingNotifications() {
  const context = useContext(BookingNotificationsContext);

  if (!context) {
    throw new Error("useBookingNotifications must be used inside BookingNotificationsProvider");
  }

  return context;
}
