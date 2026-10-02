import api from "./api";

// Public: who took each destination photo and under which licence.
export const getDestinationCredits = async () => {
  const response = await api.get("/destinations/credits");
  return response.data;
};

// Admin: every destination with its photo and credit.
export const getAdminDestinations = async () => {
  const response = await api.get("/destinations");
  return response.data;
};

const path = (name) => `/destinations/${encodeURIComponent(name)}`;

export const uploadDestinationImage = async (name, file) => {
  const formData = new FormData();
  formData.append("image", file);

  const response = await api.post(`${path(name)}/image`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const updateDestinationCredit = async (name, credit) => {
  const response = await api.put(`${path(name)}/credit`, credit);
  return response.data;
};

export const deleteDestinationImage = async (name) => {
  const response = await api.delete(`${path(name)}/image`);
  return response.data;
};
