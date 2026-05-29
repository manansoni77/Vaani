"use client";

import Image from "next/image";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { decodeGoogleJwt } from "@/lib/auth";

export default function Home() {
  const { user } = useAuth();
  const profile = user ? decodeGoogleJwt(user.googleCredential) : null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-linear-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 p-4">
      {/* Profile button — top-right */}
      <div className="fixed top-4 right-4">
        <Link
          href="/user"
          className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 rounded-full shadow-md border border-slate-200 dark:border-slate-700 hover:shadow-lg transition-shadow"
        >
          {profile?.picture ? (
            <Image
              src={profile.picture}
              alt={profile.name}
              width={28}
              height={28}
              className="rounded-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
              {profile?.name?.[0]?.toUpperCase() ?? "?"}
            </span>
          )}
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:block">
            {profile?.given_name ?? profile?.name ?? "Profile"}
          </span>
        </Link>
      </div>

      {/* Main nav */}
      <div className="flex flex-col items-center gap-12 w-full max-w-md">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            Vaani
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Manage your helpline operations
          </p>
        </div>

        <div className="flex flex-col gap-4 w-full">
          <Link
            href="/call"
            className="flex items-center justify-center px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors shadow-md hover:shadow-lg"
          >
            📞 Make a Call
          </Link>
          <Link
            href="/admin"
            className="flex items-center justify-center px-6 py-4 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors shadow-md hover:shadow-lg"
          >
            📊 Dashboard
          </Link>
          <Link
            href="/audit"
            className="flex items-center justify-center px-6 py-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors shadow-md hover:shadow-lg"
          >
            📋 Audit Logs
          </Link>
          <Link
            href="/dataset"
            className="flex items-center justify-center px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg transition-colors shadow-md hover:shadow-lg"
          >
            🗄️ Datasets
          </Link>
        </div>
      </div>
    </div>
  );
}
