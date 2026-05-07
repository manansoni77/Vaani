import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-linear-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="flex flex-col items-center gap-12 w-full max-w-md">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            Helpline UI
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
