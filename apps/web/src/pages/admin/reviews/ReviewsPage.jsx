import { useTranslation } from "react-i18next";
import { PageHeader } from "../../../components/admin/ui";
import ReviewsPanel from "../orders/ReviewsPanel";

// Guest reviews, with hide/show moderation (moved out of the orders page so
// the menu can point at it).
export default function ReviewsPage() {
  const { t } = useTranslation("orders");
  return (
    <div data-testid="reviews-page">
      <PageHeader title={t("reviews.pageTitle")} subtitle={t("reviews.pageSubtitle")} />
      <ReviewsPanel />
    </div>
  );
}
