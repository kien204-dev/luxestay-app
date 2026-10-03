import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import StatusCard from "../components/guest/StatusCard";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../utils/useDocumentTitle";

// 404, or (with `forbidden`) a page the signed-in account may not open.
export default function NotFound({ forbidden = false }) {
  const { t } = useTranslation("site");
  const { user } = useAuth();
  const key = forbidden ? "forbidden" : "notFound";
  useDocumentTitle(t(`errorPage.${key}.title`));
  const isAdmin = user?.role === "admin";

  return (
    <StatusCard
      variant="error"
      title={t(`errorPage.${key}.title`)}
      testId={`error-${key}`}
      action={
        <Link to={isAdmin ? "/admin" : "/"} className="g-btn g-btn--primary">
          {isAdmin ? t("errorPage.toAdmin") : t("errorPage.toHome")}
        </Link>
      }
    >
      {t(`errorPage.${key}.text`)}
    </StatusCard>
  );
}
