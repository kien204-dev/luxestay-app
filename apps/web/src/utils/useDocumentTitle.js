import { useEffect } from "react";
import { APP_NAME } from "../config/brand";

// "<page> · <brand>" in the browser tab; just the brand when no page title.
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
