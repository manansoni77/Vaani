import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="flex flex-col items-center gap-8 w-full max-w-4xl">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            📊 Dashboard
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Monitor calls, status, and transcriptions
          </p>
        </div>

        <div className="w-full bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-blue-50 dark:bg-slate-700 p-4 rounded-lg">
              <p className="text-slate-600 dark:text-slate-400 text-sm font-semibold">Active Calls</p>
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400 mt-2">0</p>
            </div>
            <div className="bg-green-50 dark:bg-slate-700 p-4 rounded-lg">
              <p className="text-slate-600 dark:text-slate-400 text-sm font-semibold">Completed</p>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400 mt-2">0</p>
            </div>
            <div className="bg-purple-50 dark:bg-slate-700 p-4 rounded-lg">
              <p className="text-slate-600 dark:text-slate-400 text-sm font-semibold">Pending</p>
              <p className="text-3xl font-bold text-purple-600 dark:text-purple-400 mt-2">0</p>
            </div>
          </div>

          <div className="flex flex-col gap-4 items-center justify-center py-12 text-slate-500 dark:text-slate-400">
            <p className="text-xl font-semibold">Dashboard - Placeholder</p>
            <p>Detailed implementation with call monitoring, status tracking, and transcriptions to be added later</p>
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
