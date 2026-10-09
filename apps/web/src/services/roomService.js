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
export const addRoomImage = async (roomId, file) => {
  const formData = new FormData();
  formData.append("image", file);

  const response = await api.post(`/rooms/${roomId}/images`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });

  return response.data;
};

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
