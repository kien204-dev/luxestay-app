import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import "./i18n";
import { APP_NAME, brandFaviconDataUri } from "./config/brand";
import { AuthProvider } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { BookingNotificationsProvider } from "./context/BookingNotificationsContext";

// Tab title and icon come from the brand configuration, not from files that
// would have to be replaced by hand.
document.title = APP_NAME;
const favicon = document.querySelector("link[rel='icon']") || document.createElement("link");
favicon.rel = "icon";
favicon.type = "image/svg+xml";
favicon.href = brandFaviconDataUri();
document.head.appendChild(favicon);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <ToastProvider>
        <BookingNotificationsProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </BookingNotificationsProvider>
      </ToastProvider>
    </AuthProvider>
  </React.StrictMode>
);
