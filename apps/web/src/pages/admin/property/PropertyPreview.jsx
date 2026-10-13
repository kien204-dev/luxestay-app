import { useState } from "react";
import { useTranslation } from "react-i18next";
import { normalizeImageUrl } from "../../../utils/imageUrl";

// The top of the guest home page as the form stands now, on a desktop or a
// phone: photo, logo and name, headline, contact line and the free
// cancellation window. Guests see it only after saving.
export default function PropertyPreview({ form, settings }) {
  const { t } = useTranslation("property");
  const [device, setDevice] = useState("desktop");
  const pick = (key) => (typeof form[key] === "string" && form[key].trim()) || settings.fallback[key] || "";
  const name = pick("name");
  const days = form.freeCancellationDays === "" ? settings.fallback.freeCancellationDays : form.freeCancellationDays;
  const hero = settings.stored.heroImageUrl;
  const logo = settings.stored.logoUrl;
  const host = typeof window === "undefined" ? "" : window.location.host;

  return (
    <aside className="ax-pv" aria-label={t("preview.label")} data-testid="property-preview">
      <div className="ax-pv__top">
        <span className="g-label">{t("preview.label")}</span>
        <div className="ax-seg" role="group" aria-label={t("preview.device")}>
          {["desktop", "mobile"].map((key) => (
            <button key={key} type="button" aria-pressed={device === key} onClick={() => setDevice(key)}>
              {t(`preview.${key}`)}
            </button>
          ))}
        </div>
      </div>
      <div className={`ax-pv__frame is-${device}`} aria-hidden="true">
        <div className="ax-pv__bar">
          <i />
          <i />
          <i />
          <span>{host}</span>
        </div>
        <div className={`ax-pv__hero${hero ? "" : " is-plain"}`}>
          {hero && <img src={normalizeImageUrl(hero, "")} alt="" />}
          <div className="ax-pv__logo">
            {logo ? <img src={normalizeImageUrl(logo, "")} alt="" /> : <span>{(Array.from(name)[0] || "L").toUpperCase()}</span>}
            <b>{name}</b>
          </div>
          <div className="ax-pv__copy">
            <div className="ax-pv__t">{pick("heroTitle") || t("site:home.heroTitle")}</div>
            <div className="ax-pv__s">{pick("heroSubtitle") || t("site:home.heroSubtitle", { brand: name })}</div>
            <div className="ax-pv__cta">{t("site:search.submit")}</div>
          </div>
        </div>
        <div className="ax-pv__b">
          <b>{name}</b>
          <span>{[pick("phone"), pick("address")].filter(Boolean).join(" · ") || t("preview.noContact")}</span>
          <span className="ax-badge ax-badge--accent ax-badge--plain">
            {Number(days) > 0 ? t("preview.freeCancel", { count: Number(days) }) : t("preview.noFreeCancel")}
          </span>
        </div>
      </div>
      <p className="fx-help">{t("preview.note")}</p>
    </aside>
  );
}
