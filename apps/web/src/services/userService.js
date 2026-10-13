import api from "./api";

// =========================
// GET ALL USERS
// =========================
// With { page, limit, search, role, status }: one page plus totals
// ({ data, total, totalPages, summary }). Without: every user.
export const getUsers = async (params) => {
  const response = await api.get("/users", params ? { params } : undefined);
  return response.data;
};

// =========================
// GET USER BY ID
// =========================
export const getUserById = async (id) => {
  const response = await api.get(`/users/${id}`);
  return response.data;
};

// =========================
// GET CURRENT USER PROFILE
// =========================
export const getCurrentUser = async () => {
  const response = await api.get("/users/me");
  return response.data;
};

// =========================
// UPDATE CURRENT USER PROFILE
// =========================
export const updateCurrentUserProfile = async (profileData) => {
  const response = await api.put("/users/me", profileData);
  return response.data;
};

// =========================
// CHANGE CURRENT USER PASSWORD
// =========================
export const changeCurrentUserPassword = async (passwordData) => {
  const response = await api.put("/users/me/password", passwordData);
  return response.data;
};

// =========================
// UPLOAD CURRENT USER AVATAR
// =========================
// onProgress(fraction 0..1) while the file goes up; `signal` cancels it.
export const uploadAvatar = async (file, { onProgress, signal } = {}) => {
  const formData = new FormData();
  formData.append("image", file);

  const response = await api.post("/users/me/avatar", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    signal,
    // A phone photo on a slow line takes longer than the usual request.
    timeout: 120000,
    onUploadProgress: onProgress ? (event) => event.total && onProgress(event.loaded / event.total) : undefined,
  });

  return response.data;
};

// =========================
// CREATE USER
// =========================
export const createUser = async (userData) => {
  const response = await api.post("/users", userData);
  return response.data;
};

// =========================
// UPDATE USER
// =========================
export const updateUser = async (id, userData) => {
  const response = await api.put(`/users/${id}`, userData);
  return response.data;
};

// =========================
// DELETE USER
// =========================
export const deleteUser = async (id) => {
  const response = await api.delete(`/users/${id}`);
  return response.data;
};

// =========================
// LOCK / UNLOCK USER
// =========================
export const setUserLock = async (id, locked) => {
  const response = await api.patch(`/users/${id}/lock`, { locked });
  return response.data;
};
