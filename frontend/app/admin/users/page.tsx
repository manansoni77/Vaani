"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useUser } from "@/contexts/UserContext";
import { useDepartments } from "@/contexts/DepartmentContext";
import { getUsers } from "@/lib/api";
import type { StaffUser } from "@/lib/api";
import { CREATABLE_ROLES, CAN_MANAGE_ROLES } from "@/lib/constants";
import { SpinnerIcon } from "@/components/ui/icons";
import { UserTable } from "@/components/admin-panel/UserTable";
import { DepartmentTable } from "@/components/admin-panel/DepartmentTable";
import { RegisterUserModal } from "@/components/admin-panel/RegisterUserModal";
import { CreateDepartmentModal } from "@/components/admin-panel/CreateDepartmentModal";

// ---------------------------------------------------------------------------
// Users async state — discriminated union avoids synchronous setState in effects
// ---------------------------------------------------------------------------

type UsersState =
  | { status: "loading" }
  | { status: "success"; users: StaffUser[] }
  | { status: "error"; message: string };

type Tab = "users" | "departments";

export default function AdminPage() {
  const { profile } = useUser();
  const deptCtx     = useDepartments();

  const [usersState, setUsersState] = useState<UsersState>({ status: "loading" });
  const [retryCount, setRetryCount] = useState(0);
  const [tab, setTab]               = useState<Tab>("users");
  const [showRegister, setShowReg]  = useState(false);
  const [showCreateDept, setShowCD] = useState(false);

  const myRole         = profile?.accessLevel;
  const canManage      = myRole ? CAN_MANAGE_ROLES.has(myRole) : false;
  const isSuperAdmin   = myRole === "super_admin";
  const creatableRoles = myRole ? (CREATABLE_ROLES[myRole] ?? []) : [];

  // No synchronous setState here — loading is the initial state value, not a setter call.
  useEffect(() => {
    if (!canManage) return;
    let active = true;
    getUsers()
      .then((users) => { if (active) setUsersState({ status: "success", users }); })
      .catch((e) => {
        if (active) setUsersState({ status: "error", message: e instanceof Error ? e.message : "Failed to load users" });
      });
    return () => { active = false; };
  }, [canManage, retryCount]);

  // Called from the Retry button — resets to loading and re-runs the effect.
  function retryUsers() {
    setUsersState({ status: "loading" });
    setRetryCount((c) => c + 1);
  }

  if (!canManage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
        <div className="text-center flex flex-col gap-2">
          <p className="text-slate-600 dark:text-slate-400">You don&apos;t have access to this page.</p>
          <Link href="/" className="text-sm text-indigo-600 hover:underline">← Go home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/"
            className="text-sm font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
            ← Back
          </Link>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">Admin</h1>
        </div>
        {tab === "users" && creatableRoles.length > 0 && (
          <button onClick={() => setShowReg(true)}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors">
            + Register User
          </button>
        )}
        {tab === "departments" && isSuperAdmin && (
          <button onClick={() => setShowCD(true)}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors">
            + Create Department
          </button>
        )}
      </header>

      {/* Tabs — only for super_admin */}
      {isSuperAdmin && (
        <div className="bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-700 px-5 flex gap-1">
          {(["users", "departments"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-semibold capitalize border-b-2 transition-colors ${
                tab === t
                  ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              }`}>
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-6">
        {tab === "users" && (
          usersState.status === "loading" ? (
            <div className="flex justify-center py-20">
              <SpinnerIcon className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : usersState.status === "error" ? (
            <div className="flex flex-col items-center gap-2 py-20 text-center">
              <p className="text-sm text-red-500 dark:text-red-400">{usersState.message}</p>
              <button onClick={retryUsers} className="text-sm text-indigo-600 hover:underline">Retry</button>
            </div>
          ) : usersState.users.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-20 text-slate-400 dark:text-slate-500">
              <p className="text-sm font-medium">No users found</p>
              {creatableRoles.length > 0 && <p className="text-xs">Register the first user with the button above</p>}
            </div>
          ) : (
            <UserTable users={usersState.users} />
          )
        )}

        {tab === "departments" && (
          deptCtx.isLoading ? (
            <div className="flex justify-center py-20">
              <SpinnerIcon className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : deptCtx.error ? (
            <div className="flex flex-col items-center gap-2 py-20 text-center">
              <p className="text-sm text-red-500 dark:text-red-400">{deptCtx.error}</p>
              <button onClick={deptCtx.refetch} className="text-sm text-indigo-600 hover:underline">Retry</button>
            </div>
          ) : deptCtx.departments.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-20 text-slate-400 dark:text-slate-500">
              <p className="text-sm font-medium">No departments yet</p>
              <p className="text-xs">Create the first one with the button above</p>
            </div>
          ) : (
            <DepartmentTable departments={deptCtx.departments} />
          )
        )}
      </div>

      {/* Modals */}
      {showRegister && myRole && (
        <RegisterUserModal
          creatableRoles={creatableRoles}
          departments={deptCtx.departments}
          myDepartmentId={profile?.departmentId ?? null}
          myRole={myRole}
          onClose={() => setShowReg(false)}
          onSuccess={(newUser) => {
            setUsersState((prev) =>
              prev.status === "success"
                ? { ...prev, users: [...prev.users, newUser] }
                : prev,
            );
            setShowReg(false);
          }}
        />
      )}
      {showCreateDept && (
        <CreateDepartmentModal
          onClose={() => setShowCD(false)}
          onCreate={deptCtx.create}
        />
      )}
    </div>
  );
}
