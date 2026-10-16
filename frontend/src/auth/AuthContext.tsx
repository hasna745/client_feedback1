import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, getStoredToken, setStoredToken } from "../api/client";
import type { Role, User } from "../types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (payload: {
    email: string;
    password: string;
    full_name: string;
    role: Role;
  }) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshUser() {
    const response = await api.get<User>("/api/auth/me");
    setUser(response.data);
  }

  async function login(email: string, password: string) {
    const response = await api.post<{ access_token: string }>("/api/auth/login", {
      email,
      password,
    });
    setStoredToken(response.data.access_token);
    const me = await api.get<User>("/api/auth/me");
    setUser(me.data);
    return me.data;
  }

  async function register(payload: {
    email: string;
    password: string;
    full_name: string;
    role: Role;
  }) {
    await api.post("/api/auth/register", payload);
    return login(payload.email, payload.password);
  }

  function logout() {
    setStoredToken(null);
    setUser(null);
  }

  useEffect(() => {
    async function loadUser() {
      const token = getStoredToken();
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        await refreshUser();
      } catch {
        setStoredToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, logout, refreshUser }),
    [user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return value;
}

export function defaultRouteForRole(role: Role) {
  return role === "business" ? "/business" : "/submit";
}
