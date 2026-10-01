import api from "./api";

// =========================
// VALIDATE A COUPON (preview — does not consume a usage slot)
// =========================
export const validateCoupon = async (code, amount) => {
  const response = await api.post("/coupons/validate", { code, amount });
  return response.data;
};

// =========================
// ADMIN: LIST / CREATE / UPDATE / TOGGLE ACTIVE
// =========================
export const listCoupons = async () => {
  const response = await api.get("/coupons");
  return response.data;
};

export const createCoupon = async (data) => {
  const response = await api.post("/coupons", data);
  return response.data;
};

export const updateCoupon = async (id, data) => {
  const response = await api.put(`/coupons/${id}`, data);
  return response.data;
};

export const setCouponActive = async (id, active) => {
  const response = await api.patch(`/coupons/${id}/active`, { active });
  return response.data;
};
