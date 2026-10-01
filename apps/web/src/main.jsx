import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import "./i18n";
import { APP_NAME } from "./config/brand";
import { AuthProvider } from "./context/AuthContext";
import { PropertyProvider } from "./context/PropertyContext";
import { ToastProvider } from "./context/ToastContext";
import { BookingNotificationsProvider } from "./context/BookingNotificationsContext";

// Shown until the property settings arrive from the API (see PropertyContext,
// which then owns the tab title and icon).
document.title = APP_NAME;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <PropertyProvider>
      <AuthProvider>
        <ToastProvider>
          <BookingNotificationsProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </BookingNotificationsProvider>
        </ToastProvider>
      </AuthProvider>
    </PropertyProvider>
  </React.StrictMode>
);
