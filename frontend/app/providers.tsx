"use client";

import { GoogleOAuthProvider } from "@react-oauth/google";
import { AuthProvider } from "@/contexts/AuthContext";
import { AuthGuard } from "@/components/AuthGuard";
import { GOOGLE_CLIENT_ID } from "@/lib/config";

/** Client-side provider tree that wraps the whole app. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthProvider>
        <AuthGuard>{children}</AuthGuard>
      </AuthProvider>
    </GoogleOAuthProvider>
  );
}
