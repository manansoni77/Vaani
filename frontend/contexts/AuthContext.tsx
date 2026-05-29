"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { AuthUser } from "@/lib/auth";
import { AUTH_STORAGE_KEY } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AuthContextType = {
  user: AuthUser | null;
  /** Call with the Google credential JWT after a successful sign-in. */
  login: (googleCredential: string) => void;
  logout: () => void;
  /** True while reading persisted auth from localStorage on first mount. */
  isLoading: boolean;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthContextType | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Rehydrate from localStorage on first mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (raw) {
        const stored = JSON.parse(raw) as AuthUser;
        setUser(stored);
      }
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback((googleCredential: string) => {
    console.log("[Auth] Google credential received:", googleCredential);

    // TODO: exchange googleCredential for an application token here.
    // For now, just persist the raw Google JWT.
    const authUser: AuthUser = { googleCredential };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser));
    setUser(authUser);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
