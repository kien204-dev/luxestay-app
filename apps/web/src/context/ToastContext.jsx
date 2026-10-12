import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CloseIcon, subscribeToDialogs, topDialog } from "../components/Dialog";
import i18n from "../i18n";

const ToastContext = createContext();

// At most this many at once; a new one pushes the oldest out.
const MAX_TOASTS = 3;

const MARKS = {
  success: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  error: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v5.5M12 16.2v.3" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5M12 7.8v.3" /></>,
};

// Short messages in the corner of the screen, the same on the guest site and
// in the admin area. Success and info hide themselves after 6 seconds (the
// countdown is the bar's CSS animation, which pauses while the toast is
// hovered or focused); an error stays until it is closed.
//
// While a modal dialog is open the toasts are rendered inside it (the
// innermost one): only there are they above the dialog's backdrop and still
// clickable. Otherwise they live at the end of the page.
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);
  const dialog = useSyncExternalStore(subscribeToDialogs, topDialog);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback((message, variant) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, variant }].slice(-MAX_TOASTS));
    return id;
  }, []);

  const toast = useMemo(
    () => ({
      success: (message) => show(message, "success"),
      error: (message) => show(message, "error"),
      info: (message) => show(message, "info"),
    }),
    [show]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}

      {createPortal(
      <div className="ui-toasts" data-testid="toasts">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`ui-toast ui-toast--${item.variant}`}
            role={item.variant === "error" ? "alert" : "status"}
            data-testid={`toast-${item.variant}`}
          >
            <span className="ui-toast-mark">
              <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">{MARKS[item.variant]}</svg>
            </span>
            <span className="ui-toast-text">{item.message}</span>
            <button type="button" className="ui-toast-close" onClick={() => dismiss(item.id)} aria-label={i18n.t("common:dialog.dismiss")}>
              <CloseIcon />
            </button>
            {item.variant !== "error" && <span className="ui-toast-bar" onAnimationEnd={() => dismiss(item.id)} />}
          </div>
        ))}
      </div>,
      dialog || document.body
      )}
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
