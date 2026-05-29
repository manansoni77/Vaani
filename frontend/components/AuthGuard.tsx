"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { SpinnerIcon } from "@/components/ui/icons";

// ---------------------------------------------------------------------------
// Routes that don't require authentication
// ---------------------------------------------------------------------------

const PUBLIC_PATHS = ["/login"];

// ---------------------------------------------------------------------------
// AuthGuard
// ---------------------------------------------------------------------------

/** Wrap all app children. Redirects to /login when no user is present. */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (!isLoading && !user && !isPublic) {
      router.replace("/login");
    }
  }, [isLoading, user, isPublic, router]);

  // Show a full-screen spinner while reading localStorage
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <SpinnerIcon className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  // Don't flash protected content before the redirect fires
  if (!user && !isPublic) return null;

  return <>{children}</>;
}
