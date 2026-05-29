"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "@/contexts/AuthContext";
import { UserProvider } from "@/contexts/UserContext";
import { AuthGuard } from "@/components/AuthGuard";
import { GOOGLE_CLIENT_ID } from "@/lib/config";

/**
 * Client-side provider tree that wraps the whole app.
 *
 * Order matters:
 *   GoogleOAuthProvider  — makes useGoogleLogin available
 *     AuthProvider       — owns the raw Google credential + login/logout
 *       UserProvider     — reads the credential, syncs token → apiClient,
 *                          fetches and caches the full UserProfile
 *         AuthGuard      — redirects to /login when no user is present
 *           {children}
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <UserProvider>
          <AuthGuard>{children}</AuthGuard>
        </UserProvider>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
