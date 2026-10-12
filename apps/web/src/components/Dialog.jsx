import { useEffect, useRef } from "react";

// The modal dialogs that are open, innermost last. Toasts render inside the
// last one (see ToastContext): a modal <dialog> sits in the browser's top
// layer and makes everything outside it inert, so a toast left in the page
// would be covered and could not be clicked.
const openDialogs = [];
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());

export function subscribeToDialogs(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function topDialog() {
  return openDialogs.at(-1) || null;
}

// A modal dialog. It is the browser's own <dialog>, opened with showModal():
// focus stays inside it (the rest of the page is inert), Escape closes it,
// and focus returns to where it was. Rendered only while open; `onClose` is
// called for Escape and for a click on the backdrop. Mark the element that
// should be focused first with data-autofocus (React's autoFocus runs before
// the dialog is open, when nothing in it can take focus yet).
export default function Dialog({ className = "ui-dialog", onClose, children, ...rest }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    // By the time this cleans up React has already removed the dialog, too
    // late for the browser to hand focus back by itself.
    const opener = document.activeElement;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector("[data-autofocus]")?.focus();
    openDialogs.push(dialog);
    notify();
    return () => {
      openDialogs.splice(openDialogs.indexOf(dialog), 1);
      notify();
      dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={className}
      onCancel={(event) => {
        // Let the caller decide (it may be busy); closing is unmounting.
        event.preventDefault();
        onClose?.();
      }}
      onClick={(event) => {
        // The backdrop belongs to the dialog element itself.
        if (event.target === ref.current) onClose?.();
      }}
      {...rest}
    >
      {children}
    </dialog>
  );
}

// The cross of a dialog's close button and of dismissible notices.
export function CloseIcon() {
  return (
    <svg className="ui-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
