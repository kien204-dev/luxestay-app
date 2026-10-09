import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";
import { getSocket } from "../services/socket";
import i18n from "../i18n";

const BookingNotificationsContext = createContext();

function formatBookingLabel(booking) {
  const code = `#BK-${String(booking.id).padStart(4, "0")}`;
  return booking.room_name ? `${code} — ${booking.room_name}` : code;
}

// Session-only counter: starts at 0, +1 per booking:created event received
// while the admin isn't looking at Orders, reset to 0 the moment Orders.jsx
// is opened. No per-booking "seen" flag, no persistence — deliberately the
// simplest thing that answers "did something new happen since I last
// checked", per the feature's own scope decision.
export function BookingNotificationsProvider({ children }) {
  const { user } = useAuth();
  const toast = useToast();
  const [newBookingCount, setNewBookingCount] = useState(0);

  useEffect(() => {
    if (user?.role !== "admin") return undefined;

    const socket = getSocket();
    socket.connect();

    const handleCreated = (booking) => {
      setNewBookingCount((count) => count + 1);
      toast.info(i18n.t("admin:live.newBooking", { booking: formatBookingLabel(booking) }));
    };

    // Money that has to be sent back by hand: keep these on screen longer.
    const handleRefundPending = (booking) => {
      toast.error(i18n.t("admin:live.refundPending", { code: formatBookingLabel(booking) }));
    };
    const handleDuplicatePayment = (payment) => {
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
  }, [user?.role]);

  const clearNewBookingCount = useCallback(() => setNewBookingCount(0), []);

  return (
    <BookingNotificationsContext.Provider value={{ newBookingCount, clearNewBookingCount }}>
      {children}
    </BookingNotificationsContext.Provider>
  );
}

export function useBookingNotifications() {
  const context = useContext(BookingNotificationsContext);

  if (!context) {
    throw new Error("useBookingNotifications must be used inside BookingNotificationsProvider");
  }

  return context;
}
