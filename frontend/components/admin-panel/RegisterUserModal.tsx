"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { SpinnerIcon } from "@/components/ui/icons";
import { ROLE_LABELS, DEPT_REQUIRED_ROLES, FORM_INPUT_CLS, FORM_LABEL_CLS } from "@/lib/constants";
import { registerUser } from "@/lib/api";
import type { StaffUser, RegisterUserRequest, Department } from "@/lib/api";
import type { RoleType } from "@/lib/userStore";

export function RegisterUserModal({
  creatableRoles,
  departments,
  myDepartmentId,
  myRole,
  onClose,
  onSuccess,
}: {
  creatableRoles: RoleType[];
  departments: Department[];
  myDepartmentId: number | null;
  myRole: RoleType;
  onClose: () => void;
  onSuccess: (user: StaffUser) => void;
}) {
  const [name, setName]           = useState("");
  const [email, setEmail]         = useState("");
  const [roleType, setRoleType]   = useState<RoleType>(creatableRoles[0]);
  const [departmentId, setDeptId] = useState<number | null>(
    myRole === "dept_admin" ? myDepartmentId : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const isDeptAdmin    = myRole === "dept_admin";
  const needsDept      = DEPT_REQUIRED_ROLES.has(roleType);
  const showDeptPicker = needsDept && !isDeptAdmin;
  const activeDepts    = departments.filter((d) => d.active);

  function handleRoleChange(r: RoleType) {
    setRoleType(r);
    if (!DEPT_REQUIRED_ROLES.has(r)) setDeptId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const payload: RegisterUserRequest = {
        name: name.trim(),
        email: email.trim(),
        role_type: roleType,
        ...(needsDept && { department_id: departmentId }),
      };
      onSuccess(await registerUser(payload));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Register User" onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label className={FORM_LABEL_CLS}>Full Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            required placeholder="Jane Doe" className={FORM_INPUT_CLS} />
        </div>

        <div>
          <label className={FORM_LABEL_CLS}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            required placeholder="jane@example.com" className={FORM_INPUT_CLS} />
        </div>

        <div>
          <label className={FORM_LABEL_CLS}>Role</label>
          {creatableRoles.length === 1 ? (
            <div className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-sm text-slate-600 dark:text-slate-300">
              {ROLE_LABELS[creatableRoles[0]]}
            </div>
          ) : (
            <select value={roleType} onChange={(e) => handleRoleChange(e.target.value as RoleType)}
              className={FORM_INPUT_CLS}>
              {creatableRoles.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          )}
        </div>

        {/* Department — locked for dept_admin, picker for super_admin */}
        {isDeptAdmin && needsDept && (
          <div>
            <label className={FORM_LABEL_CLS}>Department</label>
            <div className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-sm text-slate-600 dark:text-slate-300">
              {departments.find((d) => d.id === myDepartmentId)?.name ?? "Your department"}
            </div>
          </div>
        )}

        {showDeptPicker && (
          <div>
            <label className={FORM_LABEL_CLS}>Department</label>
            <select value={departmentId ?? ""} required
              onChange={(e) => setDeptId(e.target.value ? Number(e.target.value) : null)}
              className={FORM_INPUT_CLS}>
              <option value="">Select department…</option>
              {activeDepts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}

        {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors">
            Cancel
          </button>
          <button type="submit" disabled={submitting}
            className="flex-1 px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center justify-center gap-2">
            {submitting && <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />}
            Register
          </button>
        </div>
      </form>
    </Modal>
  );
}
