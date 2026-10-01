import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import Icon from "../utils/icon";

const ToastContext = createContext();

const VARIANT_STYLE = {
  success: { accent: "var(--color-success)", Icon: Icon.CheckCircle },
  error: { accent: "var(--color-danger)", Icon: Icon.AlertCircle },
  info: { accent: "var(--color-gold-500)", Icon: Icon.Info },
};

const DEFAULT_DURATION_MS = 4000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message, variant = "info", duration = DEFAULT_DURATION_MS) => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss]
  );

  const toast = useMemo(
    () => ({
      success: (message, duration) => show(message, "success", duration),
      error: (message, duration) => show(message, "error", duration),
      info: (message, duration) => show(message, "info", duration),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}

      <div
        style={{
          position: "fixed",
          top: 20,
          right: 20,
          zIndex: 4000,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          maxWidth: "min(360px, calc(100vw - 40px))",
        }}
      >
        {toasts.map((item) => {
          const style = VARIANT_STYLE[item.variant] || VARIANT_STYLE.info;
          return (
            <div
              key={item.id}
              role="status"
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "14px 16px",
                borderRadius: "var(--radius-md)",
                background: "var(--color-navy-800)",
                border: `1px solid ${style.accent}`,
                boxShadow: "var(--shadow-card)",
                color: "var(--color-text-primary)",
                fontFamily: "var(--font-sans)",
                fontSize: 13.5,
                lineHeight: 1.5,
                animation: "luxe-toast-in 0.25s ease",
              }}
            >
              <span style={{ color: style.accent, marginTop: 1, flexShrink: 0 }}>
                <style.Icon />
              </span>
              <span style={{ flex: 1 }}>{item.message}</span>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss notification"
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-text-muted)",
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes luxe-toast-in {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }

  return context;
}
