import { createContext, useCallback, useContext, useEffect, useState } from "react";
import api from "../services/api";

const AuthContext = createContext();

function readStoredUser() {
  const storedUser = localStorage.getItem("user");

  if (storedUser && storedUser !== "undefined") {
    try {
      return JSON.parse(storedUser);
    } catch {
      localStorage.removeItem("user");
    }
  }

  return null;
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(readStoredUser);
  // Only wait on a server round-trip when we have a cached user to verify;
  // guests skip straight to loading:false so anonymous pages never stall.
  const [loading, setLoading] = useState(() => Boolean(readStoredUser()));

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    api
      .get("/users/me")
      .then((res) => {
        if (cancelled) return;
        localStorage.setItem("user", JSON.stringify(res.data));
        setUser(res.data);
      })
      .catch((err) => {
        if (cancelled) return;
        // Only a confirmed invalid/expired session logs the user out here;
        // network errors keep the cached session (fail open, not closed).
        if (err.response?.status === 401) {
          localStorage.removeItem("user");
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // Runs once on mount to verify the session cached from a previous visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback((userData) => {
    localStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("user");
    const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
    fetch(`${apiBaseUrl}/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
    setUser(null);
  }, []);

  const updateCurrentUser = useCallback((userData) => {
    setUser((currentUser) => {
      const nextUser = {
        ...(currentUser || {}),
        ...userData,
      };

      localStorage.setItem("user", JSON.stringify(nextUser));
      return nextUser;
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, login, logout, updateCurrentUser, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
};
