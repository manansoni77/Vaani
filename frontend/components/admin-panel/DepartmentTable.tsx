import type { Department } from "@/lib/api";

export function DepartmentTable({ departments }: { departments: Department[] }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
            {["Name", "Description", "Status"].map((h) => (
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
          {departments.map((dept, i) => (
            <tr
              key={dept.id}
              className={i % 2 === 0 ? "bg-white dark:bg-slate-900/20" : "bg-slate-50/60 dark:bg-slate-800/40"}
            >
              <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{dept.name}</td>
              <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{dept.description ?? "—"}</td>
              <td className="px-4 py-3">
                {dept.active ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-600 dark:text-green-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                    Inactive
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
