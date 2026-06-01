import { ROLE_LABELS } from "@/lib/constants";
import type { StaffUser } from "@/lib/api";

export function UserTable({ users }: { users: StaffUser[] }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
            {["Name", "Email", "Role", "Department", "Status"].map((h) => (
              <th
                key={h}
                className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map((user, i) => (
            <tr
              key={user.id}
              className={i % 2 === 0 ? "bg-white dark:bg-slate-900/20" : "bg-slate-50/60 dark:bg-slate-800/40"}
            >
              <td className="px-4 py-3 font-medium text-slate-900 dark:text-white whitespace-nowrap">
                {user.name}
              </td>
              <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{user.email}</td>
              <td className="px-4 py-3">
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  {ROLE_LABELS[user.role_type]}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                {user.department_name ?? "—"}
              </td>
              <td className="px-4 py-3">
                {user.active ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                    Pending
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
