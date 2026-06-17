"use client";

import Image from "next/image";
import Link from "next/link";
import { useUser } from "@/contexts/UserContext";

/** Any authenticated staff role — gates the staff nav header. */
const STAFF_ROLES = new Set([
  "super_admin",
  "call_center_admin",
  "call_center_user",
  "dept_admin",
  "dept_user",
  "it_admin",
]);

/** Roles that can access admin-level pages (user management etc.). */
const ADMIN_ROLES = new Set([
  "super_admin",
  "call_center_admin",
  "dept_admin",
]);

const STAFF_NAV = [
  { href: "/admin",   label: "Dashboard" },
  { href: "/audit",   label: "Audit Logs" },
  { href: "/dataset", label: "Datasets" },
];

export default function Home() {
  const { profile } = useUser();
  const isStaff = profile != null && STAFF_ROLES.has(profile.accessLevel);
  const canAccessAdmin = profile != null && ADMIN_ROLES.has(profile.accessLevel);

  return (
    <div className="min-h-screen flex flex-col bg-linear-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800">

      {/* ── Nav bar ── */}
      <header className="flex items-center justify-between px-6 py-4">
        <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
          Vaani
        </span>

        {isStaff ? (
          <div className="flex items-center gap-2">
            {STAFF_NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="hidden sm:block px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                {n.label}
              </Link>
            ))}
            {canAccessAdmin && (
              <Link
                href="/admin/users"
                className="hidden sm:block px-3 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                Admin
              </Link>
            )}
            <Link
              href="/user"
              className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 rounded-full shadow-md border border-slate-200 dark:border-slate-700 hover:shadow-lg transition-shadow"
            >
              {profile.picture ? (
                <Image
                  src={profile.picture}
                  alt={profile.name}
                  width={24}
                  height={24}
                  className="rounded-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                  {profile.name?.[0]?.toUpperCase() ?? "?"}
                </span>
              )}
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300 hidden sm:block">
                {profile.name?.split(" ")[0]}
              </span>
            </Link>
          </div>
        ) : (
          <Link
            href="/login"
            className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-300 dark:border-slate-600 rounded-lg hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
          >
            Staff Login
          </Link>
        )}
      </header>

      {/* ── Hero ── */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12 gap-16">
        <div className="flex flex-col items-center gap-6 text-center max-w-xl">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg">
            <svg viewBox="0 0 24 24" fill="white" className="w-9 h-9">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zm-1 3a1 1 0 0 1 2 0v8a1 1 0 0 1-2 0V4zm-4 8a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.93V21h-2v-2.07A7 7 0 0 1 5 12H7z" />
            </svg>
          </div>

          <div className="flex flex-col gap-3">
            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 dark:text-white leading-tight">
              Your Voice,<br />Our Action
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 leading-relaxed">
              Report issues, file grievances, and get real-time support — all with a single call.
            </p>
          </div>

          <Link
            href="/call"
            className="flex items-center gap-3 px-8 py-4 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-lg font-bold rounded-2xl shadow-lg hover:shadow-xl transition-all"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 shrink-0">
              <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z" />
            </svg>
            Start a Call
          </Link>
        </div>

        {/* ── Feature cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl">
          {[
            {
              icon: "📋",
              title: "File a Grievance",
              body: "Describe your issue to our AI assistant and we'll route it to the right team.",
            },
            {
              icon: "📍",
              title: "Track Your Case",
              body: "Call again from the same number anytime to check the status of your open tickets.",
            },
            {
              icon: "🤝",
              title: "Talk to a Human",
              body: "If you need more help, our system escalates your call to a live operator.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-2xl p-5 flex flex-col gap-2 border border-white dark:border-slate-700 shadow-sm"
            >
              <span className="text-2xl">{f.icon}</span>
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">{f.title}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>

        {/* ── Staff dashboard shortcut (logged-in staff only) ── */}
        {isStaff && (
          <div className="flex flex-col items-center gap-3">
            <p className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wide font-semibold">
              Staff tools
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {STAFF_NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shadow-sm"
                >
                  {n.label}
                </Link>
              ))}
              {canAccessAdmin && (
                <Link
                  href="/admin/users"
                  className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors shadow-sm"
                >
                  Admin
                </Link>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="text-center py-4 text-xs text-slate-400 dark:text-slate-600">
        Vaani Helpline Platform
      </footer>
    </div>
  );
}
