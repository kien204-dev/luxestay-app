import api from "./api";

// =========================
// GET ALL ROOMS
// =========================
export const getRooms = async (params) => {
  const response = await api.get("/rooms", { params });
  return response.data;
};

// =========================
// GET DISTINCT ROOM LOCATIONS
// =========================
export const getRoomLocations = async () => {
  const response = await api.get("/rooms/locations");
  return response.data;
};

// =========================
// GET WHAT THE LIST CAN BE FILTERED BY (room types with counts, price range)
// =========================
export const getRoomFilters = async () => {
  const response = await api.get("/rooms/filters");
  return response.data;
};

// =========================
// GET DESTINATIONS (cities with room counts, for the landing page)
// =========================
export const getRoomDestinations = async () => {
  const response = await api.get("/rooms/destinations");
  return response.data;
};

// =========================
// GET TAKEN NIGHTS OF ONE ROOM (public calendar)
// =========================
export const getRoomAvailability = async (id, params) => {
  const response = await api.get(`/rooms/${id}/availability`, { params });
  return response.data;
};

// =========================
// GET ROOM BY ID
// =========================
export const getRoomById = async (id) => {
  const response = await api.get(`/rooms/${id}`);
  return response.data;
};

// =========================
// CREATE ROOM
// =========================
export const createRoom = async (roomData) => {
  const response = await api.post("/rooms", roomData);
  return response.data;
};

// =========================
// UPLOAD ROOM IMAGE
// =========================
export const uploadRoomImage = async (file) => {
  const formData = new FormData();
  formData.append("image", file);

  const response = await api.post("/rooms/upload-image", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
};

// =========================
// ADD ROOM GALLERY IMAGE
// =========================
// `onProgress(fraction)` follows the upload (0 to 1).
export const addRoomImage = async (roomId, file, onProgress) => {
  const formData = new FormData();
  formData.append("image", file);

  const response = await api.post(`/rooms/${roomId}/images`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    // Photos are processed on the server after they arrive; give it time.
    timeout: 120000,
    onUploadProgress: onProgress ? (event) => event.total && onProgress(event.loaded / event.total) : undefined,
  });

  return response.data;
};

// =========================
// ADMIN: GALLERY ORDER, COVER, STATUS COUNTS
// =========================
export const reorderRoomImages = async (roomId, ids) => (await api.put(`/rooms/${roomId}/images/order`, { ids })).data;

export const setRoomCover = async (roomId, imageId) => (await api.post(`/rooms/${roomId}/images/${imageId}/cover`)).data;

export const getRoomStatusCounts = async () => (await api.get("/rooms/status-counts")).data;

// =========================
// DELETE ROOM GALLERY IMAGE
// =========================
export const deleteRoomImage = async (roomId, imageId) => {
  const response = await api.delete(`/rooms/${roomId}/images/${imageId}`);
  return response.data;
};

// =========================
// UPDATE ROOM
// =========================
export const updateRoom = async (id, roomData) => {
  const response = await api.put(`/rooms/${id}`, roomData);
  return response.data;
};

// =========================
// DELETE ROOM
// =========================
export const deleteRoom = async (id) => {
  const response = await api.delete(`/rooms/${id}`);
  return response.data;
};

// =========================
// GET ROOM TYPES IN USE (admin; with how many rooms each)
// =========================
export const getRoomTypes = async () => {
  const response = await api.get("/rooms/types");
  return response.data;
};
