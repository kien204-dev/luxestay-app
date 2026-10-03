import { useTranslation } from "react-i18next";
import { Alert, PageHeader } from "../../components/admin/ui";
import { useAuth } from "../../context/AuthContext";
import { getCurrentUser } from "../../services/userService";
import { apiErrorText } from "../../utils/apiError";
import { useAsyncData } from "../../utils/useAsyncData";
import PasswordForm from "./PasswordForm";
import ProfileForm, { toProfile } from "./ProfileForm";

// The signed-in person's own account: profile and password.
export default function AccountPage() {
  const { t } = useTranslation("account");
  const { updateCurrentUser } = useAuth();
  const { data, error, reload } = useAsyncData("account-profile", async () => {
    const user = await getCurrentUser();
    updateCurrentUser(user);
    return user;
  });

  return (
    <div data-testid="account-page">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {error ? (
        <div className="adm-panel adm-panel--padded">
          <Alert>{apiErrorText(error, "account:loadFailed")}</Alert>
          <button type="button" className="adm-btn adm-btn--muted" onClick={reload}>{t("admin:retry")}</button>
        </div>
      ) : !data ? (
        <div className="luxe-skeleton" style={{ height: 360 }} />
      ) : (
        <div className="adm-stack">
          <ProfileForm initial={toProfile(data)} />
          <PasswordForm />
        </div>
      )}
    </div>
  );
}
