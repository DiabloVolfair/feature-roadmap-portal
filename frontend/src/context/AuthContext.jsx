import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authService } from "../services/authService";
import {
  registerAccessTokenGetter,
  registerAccessTokenSetter,
  registerAuthFailureHandler,
} from "../services/httpClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const accessTokenRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    registerAccessTokenGetter(() => accessTokenRef.current);
    registerAccessTokenSetter((token) => {
      accessTokenRef.current = token;
    });
    registerAuthFailureHandler(() => {
      logout().finally(() => navigate("/login"));
    });
  }, [navigate]);

  useEffect(() => {
    (async () => {
      try {
        accessTokenRef.current = await authService.refresh();
        setUser(await authService.getCurrentUser());
        setIsAuthenticated(true);
      } catch {
        accessTokenRef.current = null;
        setUser(null);
        setIsAuthenticated(false);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(email, password) {
    const token = await authService.login(email, password); // rejects propagate to caller (Req 21.7)
    accessTokenRef.current = token;
    setUser(await authService.getCurrentUser());
    setIsAuthenticated(true);
  }

  async function logout() {
    try {
      await authService.logout();
    } finally {
      accessTokenRef.current = null;
      setUser(null);
      setIsAuthenticated(false);
    }
  }

  function signup(name, email, password) {
    return authService.signup(name, email, password); // never touches user/isAuthenticated (Req 21.1)
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated, loading, login, logout, signup }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
