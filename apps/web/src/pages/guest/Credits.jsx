import { Link } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import StateMessage from "../../components/guest/StateMessage";
import { RoomImage } from "../../components/guest/RoomCard";
import { getDestinationCredits } from "../../services/destinationService";
import { placeholderFor } from "../../utils/imageUrl";
import { useAsyncData } from "../../utils/useAsyncData";
import { useDocumentTitle } from "../../utils/useDocumentTitle";
import "../../styles/misc.css";

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Who took the photos on this site and under which licence, as CC BY and
// CC BY-SA require. Linked from the footer.
export default function Credits() {
  const { t } = useTranslation("site");
  const { data, loading, error, reload } = useAsyncData("destination-credits", getDestinationCredits);
  useDocumentTitle(t("credits.documentTitle"));
  const credits = Array.isArray(data) ? data : [];

  return (
    <div className="guest-container credits-page" data-testid="credits-page">
      <div className="page-head">
        <ol className="crumbs">
          <li><Link to="/">{t("list.home")}</Link></li>
          <li aria-current="page">{t("credits.crumb")}</li>
        </ol>
        <h1 className="misc-title"><Trans t={t} i18nKey="credits.title" components={{ em: <em /> }} /></h1>
        <p className="credits-intro">{t("credits.intro")}</p>
      </div>

      {loading && !data ? (
        <div className="luxe-skeleton-light credits-skeleton" aria-busy="true" />
      ) : error ? (
        <StateMessage error heading="h2" title={t("credits.loadFailed")}>
          <button type="button" className="g-btn g-btn--primary" onClick={reload}>
            {t("list.retry")}
          </button>
        </StateMessage>
      ) : credits.length === 0 ? (
        <StateMessage heading="h2" title={t("credits.empty")} />
      ) : (
        <ul className="cr-list">
          {credits.map((credit) => (
            <li key={credit.name} className="cr-item">
              <div className="cr-photo">
                <RoomImage src={credit.image} alt={credit.place || credit.name} fallback={placeholderFor(credit.name, "place")} />
              </div>
              <div className="cr-what">
                <h2>{credit.title || credit.place || credit.name}</h2>
                <span>{t("credits.usedFor", { name: credit.name })}</span>
                {credit.changes && <span>{t("credits.changes")}: {credit.changes}</span>}
              </div>
              <div>{t("credits.author")}: <span className="cr-strong">{credit.author}</span></div>
              <div>
                {credit.sourceUrl && (
                  <>
                    {t("credits.source")}:{" "}
                    <a href={credit.sourceUrl} target="_blank" rel="noopener noreferrer">{hostOf(credit.sourceUrl)}</a>
                  </>
                )}
              </div>
              {credit.licenseUrl ? (
                <a className="cr-lic" href={credit.licenseUrl} target="_blank" rel="noopener noreferrer license">{credit.license}</a>
              ) : (
                <span className="cr-lic">{credit.license}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
