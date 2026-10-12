import { Link, NavLink, useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { FieldIcon } from "../../components/auth/fields";
import { useAuth } from "../../context/AuthContext";
import { getCurrentUser } from "../../services/userService";
import { apiErrorText } from "../../utils/apiError";
import { useAsyncData } from "../../utils/useAsyncData";
import { useDocumentTitle } from "../../utils/useDocumentTitle";
import AvatarCard from "./AvatarCard";
import PasswordForm from "./PasswordForm";
import ProfileForm, { toProfile } from "./ProfileForm";
import "../../styles/auth.css";
import "../../styles/account.css";

const navIcon = (children) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="fx-icon">{children}</svg>
);
const NAV_ICONS = {
  profile: navIcon(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1.2-3.6 3.9-5.5 7-5.5s5.8 1.9 7 5.5" /></>),
  bookings: navIcon(<><rect x="5" y="4.5" width="14" height="16" rx="1.5" /><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7" /></>),
  password: navIcon(<><rect x="5" y="10.5" width="14" height="10" rx="1.5" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></>),
  logout: navIcon(<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10" />),
};

// The signed-in person's own account: profile (photo and details) or the
// password, one at a time, with the account menu beside them.
export default function AccountPage({ section = "profile" }) {
  const { t } = useTranslation("account");
  const navigate = useNavigate();
  const { user, logout, updateCurrentUser } = useAuth();
  useDocumentTitle(t("documentTitle"));
  const { data, error, reload, setData } = useAsyncData("account-profile", async () => {
    const fresh = await getCurrentUser();
    updateCurrentUser(fresh);
    return fresh;
  });
  const saved = data ? toProfile(data) : null;
  const onSaved = (next) => {
    setData(next);
    updateCurrentUser(next);
  };

  const signOut = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="acct" data-testid="account-page" data-section={section}>
      <div className="page-head">
        <ol className="crumbs">
          <li><Link to="/">{t("site:list.home")}</Link></li>
          <li aria-current="page">{t("crumb")}</li>
        </ol>
        <h1 className="acct-title"><Trans t={t} i18nKey="title" components={{ em: <em /> }} /></h1>
      </div>

      <div className="ac">
        <nav className="ac-nav" aria-label={t("nav.label")}>
          <NavLink to="/settings" end>{NAV_ICONS.profile}{t("nav.profile")}</NavLink>
          <NavLink to="/my-bookings">{NAV_ICONS.bookings}{t("nav.bookings")}</NavLink>
          <NavLink to="/settings/password">{NAV_ICONS.password}{t("nav.password")}</NavLink>
          <hr />
          <button type="button" className="ac-nav__out" onClick={signOut}>{NAV_ICONS.logout}{t("nav.logout")}</button>
        </nav>

        <div>
          {section === "password" ? (
            <PasswordForm key={user?.id} />
          ) : error ? (
            <section className="ac-card">
              <div className="ac-card__b">
                <div className="fx-alert fx-alert--danger" role="alert"><FieldIcon.Alert /><p>{apiErrorText(error, "account:loadFailed")}</p></div>
                <div><button type="button" className="g-btn g-btn--outline" onClick={reload}>{t("retry")}</button></div>
              </div>
            </section>
          ) : !saved ? (
            <div className="ac-stack" aria-busy="true">
              <div className="luxe-skeleton ac-skeleton ac-skeleton--avatar" />
              <div className="luxe-skeleton ac-skeleton ac-skeleton--form" />
            </div>
          ) : (
            <div className="ac-stack">
              <AvatarCard saved={saved} onSaved={onSaved} />
              <ProfileForm saved={saved} onSaved={onSaved} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
