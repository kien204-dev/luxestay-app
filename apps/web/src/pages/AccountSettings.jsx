import { useAuth } from "../context/AuthContext";
import GuestLayout from "../layout/GuestLayout";
import MainLayout from "../layout/MainLayout";
import AccountPage from "./account/AccountPage";

// "My account" for whoever is signed in. An admin sees it inside the admin
// area; a guest sees the same page inside the guest site, not behind the
// admin sidebar.
export default function AccountSettings({ section }) {
  const { user } = useAuth();

  if (user?.role === "admin") {
    return (
      <MainLayout>
        <div className="guest-embedded">
          <AccountPage section={section} />
        </div>
      </MainLayout>
    );
  }

  return (
    <GuestLayout>
      <div className="guest-container">
        <AccountPage section={section} />
      </div>
    </GuestLayout>
  );
}
