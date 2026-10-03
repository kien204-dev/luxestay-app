import api from "./api";

// Public: name, logo and contact details the site displays.
export const getPublicSettings = async () => {
  const response = await api.get("/settings/public");
  return response.data;
};

// Admin: { stored, fallback, effective }.
export const getAdminSettings = async () => {
  const response = await api.get("/settings");
  return response.data;
};

export const updateSettings = async (values) => {
  const response = await api.put("/settings", values);
  return response.data;
};

export const uploadLogo = async (file) => {
  const formData = new FormData();
  formData.append("image", file);

  const response = await api.post("/settings/logo", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const deleteLogo = async () => {
  const response = await api.delete("/settings/logo");
  return response.data;
};

// The photo behind the search box on the home page.
export const uploadHeroImage = async (file) => {
  const formData = new FormData();
  formData.append("image", file);

  const response = await api.post("/settings/hero", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const deleteHeroImage = async () => {
  const response = await api.delete("/settings/hero");
  return response.data;
};
