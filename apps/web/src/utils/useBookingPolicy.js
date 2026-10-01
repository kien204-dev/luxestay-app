import { getBookingPolicy } from "../services/bookingService";
import { useAsyncData } from "./useAsyncData";

// The property's booking rules (free-cancellation window, how long an unpaid
// booking is held, what "today" is there). null until loaded or if it fails;
// pages then simply leave the policy text out.
export function useBookingPolicy() {
  const { data } = useAsyncData("booking-policy", () => getBookingPolicy().then((res) => res.data));
  return data;
}
