import { useEffect } from "react";

// Closes a dropdown on a click outside `ref` or on Escape (focus then goes
// back to `returnFocus`, the button that opened it).
export function useDismiss(ref, open, onClose, returnFocus) {
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      // The button that opens it toggles it itself.
      if (returnFocus?.current?.contains(event.target)) return;
      if (ref.current && !ref.current.contains(event.target)) onClose();
    };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
      returnFocus?.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open, onClose, returnFocus]);
}
