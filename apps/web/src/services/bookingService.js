import api from "./api";
import { downloadFromApi } from "../utils/download";

export const getBookings = (params) => api.get("/bookings", { params });

export const getBooking = (id) => api.get(`/bookings/${id}`);

// Admin: every room and the stays in a window of days ({ from, to }), for
// the room calendar.
export const getBookingTimeline = (params) => api.get("/bookings/timeline", { params });


export const createBooking = (data) => api.post("/bookings", data);

export const cancelBooking = (id) => api.patch(`/bookings/${id}/cancel`);

export const updateBooking = (id, status) =>
  api.put(`/bookings/${id}`, { status });

export const deleteBooking = (id) => api.delete(`/bookings/${id}`);

export const getBookingPolicy = () => api.get("/bookings/policy");

// How many of the signed-in guest's bookings are in each state.
export const getBookingCounts = () => api.get("/bookings/counts").then((res) => res.data);

// The booking as a one-page PDF (the booking's owner, or an admin).
export const downloadBookingReceipt = (id, lang) =>
  downloadFromApi(`/bookings/${id}/receipt`, {
    params: lang ? { lang } : undefined,
    fallbackName: `booking-${id}.pdf`,
  });

// Admin: money received outside the online gateways (cash, bank transfer).
export const markBookingPaid = (id) => api.patch(`/bookings/${id}/mark-paid`);

// Admin: the refund has actually been sent back to the guest.
export const confirmRefund = (id) => api.patch(`/bookings/${id}/refund`);