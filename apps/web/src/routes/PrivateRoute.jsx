import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { loginPathFor } from "../utils/authRedirect";
import PageLoader from "../components/PageLoader";

function PrivateRoute({ children, role }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;

  // Not signed in: come back to this exact page afterwards.
  if (!user) {
    return <Navigate to={loginPathFor(location)} replace />;
  }

  if (
    user.must_change_password &&
    !["/settings", "/profile"].includes(location.pathname)
  ) {
    return <Navigate to="/settings" replace />;
  }

  if (role && user.role !== role) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}

export default PrivateRoute;
