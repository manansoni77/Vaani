"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { AuthUser } from "@/lib/auth";
import { AUTH_STORAGE_KEY, decodeGoogleJwt } from "@/lib/auth";
import { API_BASE } from "@/lib/config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
};

type AuthContextType = {
  user: AuthUser | null;
  /**
   * Exchange a Google credential for an app JWT via POST /auth/google.
   * Throws with a human-readable message on failure (401 / 403 / network).
   */
  login: (googleCredential: string) => Promise<void>;
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
        setUser(JSON.parse(raw) as AuthUser);
      }
    } catch {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback(async (googleCredential: string) => {
    // Capture picture from the Google JWT before discarding the credential
    const picture = decodeGoogleJwt(googleCredential)?.picture;

    const res = await fetch(`${API_BASE}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: googleCredential }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const reason =
        res.status === 401 ? "Invalid Google credential." :
        res.status === 403 ? "Account not provisioned or inactive. Contact your admin." :
        `Sign-in failed (${res.status})${text ? `: ${text}` : ""}.`;
      throw new Error(reason);
    }

    const { access_token } = (await res.json()) as TokenResponse;

    const authUser: AuthUser = { accessToken: access_token, picture };
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
