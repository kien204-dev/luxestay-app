import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";
import { getSocket } from "../services/socket";

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
      toast.info(`Có booking mới: ${formatBookingLabel(booking)}`);
    };

    // Money that has to be sent back by hand: keep these on screen longer.
    const handleRefundPending = (booking) => {
      toast.error(`Booking #${booking.id} cần hoàn tiền. Xem trang Orders.`, 15000);
    };
    const handleDuplicatePayment = (payment) => {
      toast.error(
        `Booking #${payment.booking_id} bị thanh toán hai lần (${payment.transaction_ref}). Cần hoàn lại khoản thừa.`,
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
