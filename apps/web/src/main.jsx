import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import "./i18n";
import { APP_NAME } from "./config/brand";



import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext"; // ✅ import AuthProvider
import { ToastProvider } from "./context/ToastContext";
import { BookingNotificationsProvider } from "./context/BookingNotificationsContext";

document.title = APP_NAME;

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider> {/* ✅ bọc ở đây */}
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