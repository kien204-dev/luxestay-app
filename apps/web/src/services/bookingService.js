import api from "./api";

export const getBookings = (params) => api.get("/bookings", { params });

export const getBooking = (id) => api.get(`/bookings/${id}`);

export const getBookingCalendar = (params) =>
  api.get("/bookings/calendar", { params });

export const createBooking = (data) => api.post("/bookings", data);

export const cancelBooking = (id) => api.patch(`/bookings/${id}/cancel`);

export const updateBooking = (id, status) =>
  api.put(`/bookings/${id}`, { status });

export const deleteBooking = (id) => api.delete(`/bookings/${id}`);

export const getBookingPolicy = () => api.get("/bookings/policy");

// Admin: money received outside the online gateways (cash, bank transfer).
export const markBookingPaid = (id) => api.patch(`/bookings/${id}/mark-paid`);

// Admin: the refund has actually been sent back to the guest.
export const confirmRefund = (id) => api.patch(`/bookings/${id}/refund`);