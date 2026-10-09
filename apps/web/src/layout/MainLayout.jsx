import { useTranslation } from "react-i18next";
import Sidebar from "../layout/components/Sidebar";
import { useAuth } from "../context/AuthContext";
import { LanguageSwitch } from "../components/admin/ui";
import DemoBanner from "../components/DemoBanner";
import ThemeSwitch from "../components/ThemeSwitch";
import "../styles/admin.css";

function MainLayout({ children }) {
  const { t } = useTranslation("admin");
  const { user } = useAuth();

  return (
    <div className="adm-root">
      <DemoBanner admin />
      <div className="adm-shell">
      <Sidebar />

      <main className="adm-main">
        <div className="adm-topbar">
          <h2>{t("greeting", { name: user?.name || "" })}</h2>
          <div className="adm-topbar-right">
            <LanguageSwitch />
            <ThemeSwitch className="adm-icon-btn" />
            <span className="adm-role">{t(`roles.${user?.role}`, { defaultValue: user?.role || "" })}</span>
          </div>
        </div>

        <div className="adm-content">{children}</div>
      </main>
      </div>
    </div>
  );
}

export default MainLayout;
