import { useAuth } from "../context/AuthContext";
import GuestLayout from "../layout/GuestLayout";
import MainLayout from "../layout/MainLayout";
import Settings from "./Settings";

// "My account" for whoever is signed in. An admin sees it inside the admin
// area; a guest sees the same page inside the guest site, not behind the
// admin sidebar.
export default function AccountSettings() {
  const { user } = useAuth();

  if (user?.role === "admin") {
    return (
      <MainLayout>
        <Settings />
      </MainLayout>
    );
  }

  return (
    <GuestLayout>
      <div className="guest-container account-light">
        <Settings />
      </div>
    </GuestLayout>
  );
}
