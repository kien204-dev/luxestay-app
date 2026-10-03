import { useTranslation } from "react-i18next";
import { Alert, PageHeader } from "../../../components/admin/ui";
import { getAdminDestinations } from "../../../services/destinationService";
import { apiErrorText } from "../../../utils/apiError";
import { useAsyncData } from "../../../utils/useAsyncData";
import DestinationRow from "./DestinationRow";

// Admin: the photo shown for each destination on the home page, and the
// credit its licence asks for.
export default function DestinationsPage() {
  const { t } = useTranslation("property");
  const { data, loading, error, reload } = useAsyncData("admin-destinations", getAdminDestinations);
  const destinations = Array.isArray(data) ? data : [];

  return (
    <div data-testid="destinations-page">
      <PageHeader title={t("destinations.title")} subtitle={t("destinations.subtitle")} />
      {loading && !data ? (
        <div className="luxe-skeleton" style={{ height: 260, maxWidth: 980 }} />
      ) : error ? (
        <div className="adm-panel adm-panel--padded" style={{ maxWidth: 980 }}>
          <Alert>{apiErrorText(error, "admin:loadFailed")}</Alert>
          <button type="button" className="adm-btn adm-btn--muted" onClick={reload}>{t("admin:retry")}</button>
        </div>
      ) : (
        <div className="adm-stack" style={{ maxWidth: 980 }}>
          {destinations.map((destination) => (
            <DestinationRow key={`${destination.name}:${destination.image || ""}`} destination={destination} onChanged={reload} />
          ))}
        </div>
      )}
    </div>
  );
}
