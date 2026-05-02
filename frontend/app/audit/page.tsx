import Link from "next/link";

export default function AuditPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-linear-to-br from-purple-50 to-pink-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-4xl">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            📋 Audit Logs
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            View backend logs and audit trail
          </p>
        </div>

        <div className="w-full bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8">
          <div className="flex flex-col gap-2 mb-6">
            <input
              type="text"
              placeholder="Search logs..."
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex flex-col gap-4 items-center justify-center py-12 text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700">
            <p className="text-xl font-semibold">Audit Logs - Placeholder</p>
            <p>Backend logs and audit trail to be displayed here</p>
          </div>
        </div>

        <Link
          href="/"
          className="px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white font-semibold rounded-lg transition-colors"
        >
          ← Back to Home
        </Link>
      </div>
    </div>
  );
}
