import axios from "axios";
import i18n from "../i18n";

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
  "/reset-password/check",
]);

export const SESSION_EXPIRED_EVENT = "auth:session-expired";

// Emails and documents about a booking are written in the language the
// guest was using when they made it.
api.interceptors.request.use((config) => {
  config.headers["Accept-Language"] = i18n.resolvedLanguage || i18n.language || "vi";
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestPath = String(error.config?.url || "").split("?")[0];
    const isPublicAuthRequest = PUBLIC_AUTH_PATHS.has(requestPath);

    // A 401 from a public credential endpoint must remain on the page so its
    // validation message can be shown. Anywhere else it means the session is
    // gone: tell the app, which signs the user out. Protected pages then send
    // them to the login form; public pages (the guest site) just carry on.
    if (error.response?.status === 401 && !isPublicAuthRequest) {
      localStorage.removeItem("user");
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }

    return Promise.reject(error);
  }
);

export default api;
