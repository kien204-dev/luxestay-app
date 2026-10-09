import { useTranslation } from "react-i18next";
import Sidebar from "../layout/components/Sidebar";
import { useAuth } from "../context/AuthContext";
import { useProperty } from "../context/PropertyContext";
import { LanguageSwitch } from "../components/admin/ui";
import "../styles/admin.css";

function MainLayout({ children }) {
  const { t } = useTranslation("admin");
  const { user } = useAuth();
  const property = useProperty();

  return (
    <div className="adm-shell theme-dark">
      <Sidebar />

      <main className="adm-main">
        {property.demo && (
          <div className="adm-demo-banner" role="note">
            {property.demo.resetIntervalHours
              ? t("demo.bannerTimed", { hours: property.demo.resetIntervalHours })
              : t("demo.banner")}
          </div>
        )}
        <div className="adm-topbar">
          <h2>{t("greeting", { name: user?.name || "" })}</h2>
          <div className="adm-topbar-right">
            <LanguageSwitch />
            <span className="adm-role">{t(`roles.${user?.role}`, { defaultValue: user?.role || "" })}</span>
          </div>
        </div>

        <div className="adm-content">{children}</div>
      </main>
    </div>
  );
}

export default MainLayout;
