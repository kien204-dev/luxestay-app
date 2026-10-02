import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { postLoginPath } from "../utils/authRedirect";

// Wraps the sign-in pages: someone already signed in is sent on to where
// they were heading (?next=...) or to their home page.
export default function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (user) {
    return <Navigate replace to={postLoginPath(user, location.search)} />;
  }

  return children;
}
