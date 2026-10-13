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

// A new photo, with the credit for it (the old photo's credit is cleared).
// onProgress(0..1) follows the upload.
export const uploadDestinationImage = async (name, file, credit = {}, onProgress) => {
  const formData = new FormData();
  for (const [key, value] of Object.entries(credit)) formData.append(key, value ?? "");
  formData.append("image", file);

  const response = await api.post(`${path(name)}/image`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
    onUploadProgress: onProgress ? (event) => event.total && onProgress(event.loaded / event.total) : undefined,
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
