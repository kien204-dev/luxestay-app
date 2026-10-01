import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:3001/api",
  withCredentials: true,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

const PUBLIC_AUTH_PATHS = new Set([
  "/login",
  "/register",
  "/google-login",
  "/forgot-password",
  "/reset-password",
]);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestPath = String(error.config?.url || "").split("?")[0];
    const isPublicAuthRequest = PUBLIC_AUTH_PATHS.has(requestPath);

    // A 401 from a public credential endpoint must remain on the page so its
    // validation message can be shown. Protected requests still end the session.
    if (error.response?.status === 401 && !isPublicAuthRequest) {
      localStorage.removeItem("user");

      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default api;
