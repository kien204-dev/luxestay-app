import api from "./api";

export const getPaymentProviders = () => api.get("/payments/providers");

export const createPayment = (bookingId, provider) =>
  api.post(`/payments/bookings/${bookingId}`, { provider });

export const getPaymentForBooking = (bookingId) =>
  api.get(`/payments/bookings/${bookingId}`);

export const getPaymentByTransactionRef = (ref) =>
  api.get(`/payments/transactions/${ref}`);
