import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";


export default function PublicRoute({ children }) {
    const { user, loading } = useAuth();

    if (loading) return null;

    if (user) {
        return (
            <Navigate
                replace
                to={user.must_change_password
                    ? "/settings"
                    : user.role === "admin"
                        ? "/dashboard"
                        : "/booking"}
            />
        );
    }

    return children;
}
