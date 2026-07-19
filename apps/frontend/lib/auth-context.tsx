"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { apiRequest, clearToken, setToken } from "./api";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_USER_KEY = "sitepulse_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_USER_KEY);
    if (raw) {
      try {
        setUser(JSON.parse(raw));
      } catch {
        /* ignore corrupt cache */
      }
    }
    setLoading(false);
  }, []);

  const persistSession = useCallback((nextUser: User, token: string) => {
    setToken(token);
    window.localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await apiRequest<{ user: User; token: string }>("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      persistSession(data.user, data.token);
      router.push("/dashboard");
    },
    [persistSession, router]
  );

  const register = useCallback(
    async (email: string, password: string, name?: string) => {
      const data = await apiRequest<{ user: User; token: string }>("/auth/register", {
        method: "POST",
        body: { email, password, name },
      });
      persistSession(data.user, data.token);
      router.push("/dashboard");
    },
    [persistSession, router]
  );

  const logout = useCallback(() => {
    clearToken();
    window.localStorage.removeItem(STORAGE_USER_KEY);
    setUser(null);
    router.push("/login");
  }, [router]);

  const value = useMemo(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
