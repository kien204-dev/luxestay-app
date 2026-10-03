import { createContext, useContext, useEffect, useMemo } from "react";
import { APP_NAME, CONTACT, brandFaviconDataUri } from "../config/brand";
import { getPublicSettings } from "../services/settingsService";
import { normalizeImageUrl } from "../utils/imageUrl";
import { useAsyncData } from "../utils/useAsyncData";
import i18n from "../i18n";

// Who the property is: name, logo, home page photo, contact details, check-in/out times and
// the cancellation window. An admin edits these under /admin/property and
// the API serves them, so the site reflects a change on the next page load
// with no rebuild. Until the API has answered (or if it cannot be reached)
// the values baked in at build time are used.
const BUILD_TIME_DEFAULTS = {
  name: APP_NAME,
  logoUrl: "",
  heroImageUrl: "",
  phone: CONTACT.phone,
  email: CONTACT.email,
  address: CONTACT.address,
  checkInTime: "14:00",
  checkOutTime: "12:00",
  freeCancellationDays: null,
};

const PropertyContext = createContext({ ...BUILD_TIME_DEFAULTS, initial: "L", reload: () => {} });

function setFavicon(href, type) {
  const link = document.querySelector("link[rel='icon']") || document.createElement("link");
  link.rel = "icon";
  link.type = type;
  link.href = href;
  document.head.appendChild(link);
}

export function PropertyProvider({ children }) {
  const { data, reload } = useAsyncData("property", getPublicSettings);

  const property = useMemo(() => {
    const settings = { ...BUILD_TIME_DEFAULTS, ...(data || {}) };
    return {
      ...settings,
      logoUrl: settings.logoUrl ? normalizeImageUrl(settings.logoUrl, "") : "",
      heroImageUrl: settings.heroImageUrl ? normalizeImageUrl(settings.heroImageUrl, "") : "",
      // First letter of the name: the logo mark when there is no logo image.
      initial: (Array.from(settings.name)[0] || "L").toUpperCase(),
      reload,
    };
  }, [data, reload]);

  // The browser tab follows the property: its logo if it has one, otherwise
  // a monogram of its name.
  useEffect(() => {
    if (property.logoUrl) {
      setFavicon(property.logoUrl, "");
    } else {
      setFavicon(brandFaviconDataUri(property.initial), "image/svg+xml");
    }
  }, [property.logoUrl, property.initial]);

  // Translations refer to the property as {{brand}}. Point that at the
  // current name and have translated text re-render with it.
  useEffect(() => {
    const variables = i18n.options.interpolation.defaultVariables;
    if (variables.brand === property.name) return;
    variables.brand = property.name;
    i18n.emit("languageChanged", i18n.language);
  }, [property.name]);

  return <PropertyContext.Provider value={property}>{children}</PropertyContext.Provider>;
}

export function useProperty() {
  return useContext(PropertyContext);
}
