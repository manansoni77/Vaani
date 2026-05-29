"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { GoogleLogin } from "@react-oauth/google";
import { useAuth } from "@/contexts/AuthContext";

export default function LoginPage() {
  const { user, login } = useAuth();
  const router = useRouter();

  // Already logged in — go home
  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

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

          <GoogleLogin
            onSuccess={(response) => {
              if (response.credential) {
                login(response.credential);
              }
            }}
            onError={() => {
              console.error("[Auth] Google sign-in failed");
            }}
            useOneTap
          />
        </div>
      </div>
    </div>
  );
}
