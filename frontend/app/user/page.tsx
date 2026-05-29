"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { decodeGoogleJwt } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Mock data — replace with API call when endpoint is ready
// ---------------------------------------------------------------------------

const MOCK_USER_DETAILS = {
  department: "Emergency Response Unit",
  accessLevel: "Operator",
  userSince: "2024-03-15",
  deptAdmin: {
    name: "Priya Sharma",
    email: "priya.sharma@vaani.gov.in",
  },
  itAdmin: {
    name: "Rohan Mehta",
    email: "rohan.mehta@vaani.gov.in",
  },
  superAdmin: {
    name: "Ananya Iyer",
    email: "ananya.iyer@vaani.gov.in",
  },
};

// ---------------------------------------------------------------------------
// Small reusable pieces
// ---------------------------------------------------------------------------

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">
        {label}
      </span>
      <span className="text-sm text-slate-800 dark:text-slate-200 font-medium break-all">
        {value}
      </span>
    </div>
  );
}

function AdminRow({
  role,
  name,
  email,
}: {
  role: string;
  name: string;
  email: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 dark:border-slate-700 last:border-0">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wide">
          {role}
        </span>
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {name}
        </span>
        <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
          {email}
        </span>
      </div>
      <a
        href={`mailto:${email}`}
        className="shrink-0 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-lg transition-colors mt-1"
      >
        Email
      </a>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function UserPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const profile = user ? decodeGoogleJwt(user.googleCredential) : null;
  const details = MOCK_USER_DETAILS;

  const formattedUserSince = new Date(details.userSince).toLocaleDateString(
    "en-IN",
    { year: "numeric", month: "long", day: "numeric" },
  );

  function handleLogout() {
    logout();
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
          >
            ← Back
          </Link>
          <button
            onClick={handleLogout}
            className="px-4 py-1.5 text-sm font-semibold bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800 transition-colors"
          >
            Sign out
          </button>
        </div>

        {/* Profile header */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex items-center gap-5">
          {profile?.picture ? (
            <Image
              src={profile.picture}
              alt={profile.name}
              width={64}
              height={64}
              className="rounded-full object-cover ring-2 ring-indigo-200 dark:ring-indigo-700 shrink-0"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold shrink-0">
              {profile?.name?.[0]?.toUpperCase() ?? "?"}
            </span>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 dark:text-white truncate">
              {profile?.name ?? "—"}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 truncate">
              {profile?.email ?? "—"}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Member since {formattedUserSince}
            </p>
          </div>
        </div>

        {/* Basic info */}
        <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col gap-5">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Basic Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <InfoRow label="Full Name" value={profile?.name ?? "—"} />
            <InfoRow label="Email Address" value={profile?.email ?? "—"} />
            <InfoRow label="Google Account ID" value={profile?.sub ?? "—"} />
            <InfoRow label="Member Since" value={formattedUserSince} />
          </div>
        </section>

        {/* Dept & access */}
        <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col gap-5">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Department &amp; Access
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <InfoRow label="Department" value={details.department} />
            <InfoRow label="Access Level" value={details.accessLevel} />
          </div>
        </section>

        {/* Admin hierarchy */}
        <section className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-6 flex flex-col gap-4">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Admin Hierarchy
          </h2>
          <div className="flex flex-col">
            <AdminRow
              role="Department Admin"
              name={details.deptAdmin.name}
              email={details.deptAdmin.email}
            />
            <AdminRow
              role="IT Admin"
              name={details.itAdmin.name}
              email={details.itAdmin.email}
            />
            <AdminRow
              role="Super Admin"
              name={details.superAdmin.name}
              email={details.superAdmin.email}
            />
          </div>
        </section>

        {/* Disclaimer */}
        <p className="text-center text-xs text-slate-400 dark:text-slate-600 pb-4">
          All information is read-only. Contact your admin to make changes.
        </p>
      </div>
    </div>
  );
}
