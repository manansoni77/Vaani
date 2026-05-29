"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // Already logged in — go home
  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  async function handleGoogleSuccess(credential: string) {
    setError(null);
    setLoggingIn(true);
    try {
      await login(credential);
      // AuthContext sets user → useEffect above redirects to /
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed. Please try again.");
    } finally {
      setLoggingIn(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-sm">
        {/* Logo / title */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            Vaani
          </h1>
          <p className="text-slate-600 dark:text-slate-400">
            Sign in to access the dashboard
          </p>
        </div>

        {/* Login card */}
        <div className="w-full bg-white dark:bg-slate-800 rounded-2xl shadow-lg p-8 flex flex-col items-center gap-6">
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
            Use your organisation Google account to continue.
          </p>

          {loggingIn ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <span className="w-4 h-4 border-2 border-slate-300 border-t-indigo-600 rounded-full animate-spin" />
              Signing in…
            </div>
          ) : (
            <GoogleLogin
              onSuccess={(response) => {
                if (response.credential) {
                  handleGoogleSuccess(response.credential);
                }
              }}
              onError={() => {
                setError("Google sign-in failed. Please try again.");
              }}
            />
          )}

          {error && (
            <p className="text-sm text-red-500 dark:text-red-400 text-center">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
