"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import { useAuth } from "@/contexts/AuthContext";
import { setApiToken, apiFetch } from "@/lib/apiClient";
import type { UserProfile, BackendUserResponse } from "@/lib/userStore";
import { USER_STORAGE_KEY, mapBackendUser } from "@/lib/userStore";

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

type UserContextType = {
  profile: UserProfile | null;
  isLoading: boolean;
  error: string | null;
  /** Re-fetch the profile from GET /users/me and refresh localStorage. */
  refetch: () => Promise<void>;
};

const UserContext = createContext<UserContextType | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function UserProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the API client token in sync with auth state
  useEffect(() => {
    setApiToken(user?.accessToken ?? null);
  }, [user]);

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiFetch<BackendUserResponse>("/users/me");
      const merged = mapBackendUser(data, user.picture);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(merged));
      setProfile(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profile");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // On auth change: rehydrate from cache first, then refresh from API
  useEffect(() => {
    if (!user) {
      setProfile(null);
      localStorage.removeItem(USER_STORAGE_KEY);
      return;
    }

    // Optimistic: show cached data instantly while the fetch runs
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (raw) {
      try {
        setProfile(JSON.parse(raw) as UserProfile);
      } catch {
        localStorage.removeItem(USER_STORAGE_KEY);
      }
    }

    fetchProfile();
  }, [user, fetchProfile]);

  return (
    <UserContext.Provider value={{ profile, isLoading, error, refetch: fetchProfile }}>
      {children}
    </UserContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useUser(): UserContextType {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used inside <UserProvider>");
  return ctx;
}
