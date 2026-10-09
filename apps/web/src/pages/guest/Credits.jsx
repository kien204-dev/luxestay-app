import { useTranslation } from "react-i18next";
import StateMessage from "../../components/guest/StateMessage";
import { RoomImage } from "../../components/guest/RoomCard";
import { getDestinationCredits } from "../../services/destinationService";
import { placeholderFor } from "../../utils/imageUrl";
import { useAsyncData } from "../../utils/useAsyncData";
import { useDocumentTitle } from "../../utils/useDocumentTitle";

// Who took the photos on this site and under which licence, as CC BY and
// CC BY-SA require. Linked from the footer.
export default function Credits() {
  const { t } = useTranslation("site");
  const { data, loading, error, reload } = useAsyncData("destination-credits", getDestinationCredits);
  useDocumentTitle(t("credits.documentTitle"));
  const credits = Array.isArray(data) ? data : [];

  return (
    <div className="guest-container credits-page" data-testid="credits-page">
      <h1>{t("credits.title")}</h1>
      <p className="credits-intro">{t("credits.intro")}</p>

      {loading && !data ? (
        <div className="luxe-skeleton-light skeleton-card" aria-busy="true" />
      ) : error ? (
        <StateMessage error heading="h2" title={t("credits.loadFailed")}>
          <button type="button" className="g-btn g-btn--primary" onClick={reload}>
            {t("list.retry")}
          </button>
        </StateMessage>
      ) : credits.length === 0 ? (
        <StateMessage heading="h2" title={t("credits.empty")} />
      ) : (
        <ul className="credits-list">
          {credits.map((credit) => (
            <li key={credit.name} className="credits-item">
              <RoomImage src={credit.image} alt={credit.place || credit.name} fallback={placeholderFor(credit.name, "place")} />
              <div>
                <h2>{credit.name}</h2>
                <dl>
                  {credit.place && (
                    <>
                      <dt>{t("credits.place")}</dt>
                      <dd>{credit.place}</dd>
                    </>
                  )}
                  {credit.title && (
                    <>
                      <dt>{t("credits.originalTitle")}</dt>
                      <dd>{credit.title}</dd>
                    </>
                  )}
                  <dt>{t("credits.author")}</dt>
                  <dd>{credit.author}</dd>
                  <dt>{t("credits.license")}</dt>
                  <dd>
                    {credit.licenseUrl ? (
                      <a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer license">
                        {credit.license}
                      </a>
                    ) : (
                      credit.license
                    )}
                  </dd>
                  {credit.sourceUrl && (
                    <>
                      <dt>{t("credits.source")}</dt>
                      <dd>
                        <a href={credit.sourceUrl} target="_blank" rel="noopener noreferrer">
                          {t("credits.sourceLink")}
                        </a>
                      </dd>
                    </>
                  )}
                  {credit.changes && (
                    <>
                      <dt>{t("credits.changes")}</dt>
                      <dd>{credit.changes}</dd>
                    </>
                  )}
                </dl>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
