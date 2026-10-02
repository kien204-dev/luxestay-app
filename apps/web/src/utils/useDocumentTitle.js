import { useEffect } from "react";
import { useProperty } from "../context/PropertyContext";

// "<page> · <brand>" in the browser tab; just the brand when no page title.
export function useDocumentTitle(title) {
  const { name } = useProperty();

  useEffect(() => {
    document.title = title ? `${title} · ${name}` : name;
  }, [title, name]);
}
