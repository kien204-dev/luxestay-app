import { useAuth } from "../context/AuthContext";
import GuestLayout from "../layout/GuestLayout";
import MainLayout from "../layout/MainLayout";
import AccountPage from "./account/AccountPage";

// "My account" for whoever is signed in. An admin sees it inside the admin
// area; a guest sees the same page inside the guest site, not behind the
// admin sidebar.
export default function AccountSettings() {
  const { user } = useAuth();

  if (user?.role === "admin") {
    return (
      <MainLayout>
        <AccountPage />
      </MainLayout>
    );
  }

  return (
    <GuestLayout>
      <div className="guest-container account-light">
        <AccountPage />
      </div>
    </GuestLayout>
  );
}
