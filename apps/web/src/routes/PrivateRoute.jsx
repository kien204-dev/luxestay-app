import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { MUST_CHANGE_PASSWORD_PATH, loginPathFor } from "../utils/authRedirect";
import PageLoader from "../components/PageLoader";

function PrivateRoute({ children, role }) {
  const { user, loading, signedOut } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;

  // Just pressed "Sign out" here: home, not the login form.
  if (!user && signedOut) {
    return <Navigate to="/" replace />;
  }

  // Not signed in: come back to this exact page afterwards.
  if (!user) {
    return <Navigate to={loginPathFor(location)} replace />;
  }

  // A temporary password (admin-created account, admin:reset) must be
  // replaced before anything else.
  if (user.must_change_password && location.pathname !== MUST_CHANGE_PASSWORD_PATH) {
    return <Navigate to={MUST_CHANGE_PASSWORD_PATH} replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to="/unauthorized" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  return children;
}

export default PrivateRoute;
