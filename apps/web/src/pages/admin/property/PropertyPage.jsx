import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, PageHeader } from "../../../components/admin/ui";
import { useProperty } from "../../../context/PropertyContext";
import { useToast } from "../../../context/ToastContext";
import { deleteHeroImage, deleteLogo, getAdminSettings, uploadHeroImage, uploadLogo } from "../../../services/settingsService";
import { apiErrorText, apiSuccessText } from "../../../utils/apiError";
import { useAsyncData } from "../../../utils/useAsyncData";
import ImageSetting from "./ImageSetting";
import PropertyForm from "./PropertyForm";

// Admin: the property's name, logo, home page photo, contact details and
// house rules. Changes show on the guest site, in emails and on PDFs at once.
export default function PropertyPage() {
  const { t } = useTranslation("property");
  const toast = useToast();
  const property = useProperty();
  const { data, loading, error, reload, setData } = useAsyncData("admin-settings", getAdminSettings);
  const [actionError, setActionError] = useState("");

  // The header, tab title and footer read the public settings: refresh them
  // so this very page updates too.
  const saved = (result) => {
    setActionError("");
    setData(result);
    property.reload();
    toast.success(apiSuccessText(result, "property:saved"));
  };

  return (
    <div data-testid="property-page">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <Alert>{actionError}</Alert>

      {data ? (
        <div className="adm-stack" style={{ maxWidth: 860 }}>
          <ImageSetting
            title={t("logo.title")}
            hint={t("logo.hint")}
            value={data.stored.logoUrl}
            empty={<span style={{ fontFamily: "var(--font-serif)", fontSize: 40, fontWeight: 700, color: "var(--color-gold-400)" }}>{property.initial}</span>}
            upload={uploadLogo}
            remove={deleteLogo}
            onSaved={saved}
            onError={setActionError}
            previewStyle={{ width: 88, height: 88, background: "var(--color-surface-light)", objectFit: "contain" }}
            testId="logo"
          />
          <ImageSetting
            title={t("hero.title")}
            hint={t("hero.hint")}
            value={data.stored.heroImageUrl}
            empty={t("hero.none")}
            upload={uploadHeroImage}
            remove={deleteHeroImage}
            onSaved={saved}
            onError={setActionError}
            previewStyle={{ width: "100%", aspectRatio: "16 / 6" }}
            testId="hero"
          />
          <PropertyForm key={JSON.stringify(data.stored)} settings={data} onSaved={saved} onError={setActionError} />
        </div>
      ) : loading ? (
        <div className="luxe-skeleton" style={{ height: 320, maxWidth: 860 }} />
      ) : (
        <div className="adm-panel adm-panel--padded" style={{ maxWidth: 860 }}>
          <Alert>{apiErrorText(error, "admin:loadFailed")}</Alert>
          <button type="button" className="adm-btn adm-btn--muted" onClick={reload}>{t("admin:retry")}</button>
        </div>
      )}
    </div>
  );
}
