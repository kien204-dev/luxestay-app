import api from "./api";

// =========================
// GET REVIEWS FOR A ROOM (public)
// =========================
export const getRoomReviews = async (roomId, params) => {
  const response = await api.get(`/rooms/${roomId}/reviews`, { params });
  return response.data;
};

// =========================
// GET THE OVERALL SCORE AND THE BEST REVIEWS (public, home page)
// =========================
export const getFeaturedReviews = async () => {
  const response = await api.get("/reviews/featured");
  return response.data;
};

// =========================
// CREATE A REVIEW
// =========================
export const createReview = async (roomId, data) => {
  const response = await api.post(`/rooms/${roomId}/reviews`, data);
  return response.data;
};

// =========================
// ADMIN: LIST ALL REVIEWS
// =========================
export const listReviews = async (params) => {
  const response = await api.get("/reviews", { params });
  return response.data;
};

// =========================
// ADMIN: HIDE / UNHIDE A REVIEW
// =========================
export const setReviewHidden = async (id, hidden) => {
  const response = await api.patch(`/reviews/${id}/hide`, { hidden });
  return response.data;
};
