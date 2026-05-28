interface Props {
  logs: string[];
}

export function ActivityLog({ logs }: Props) {
  return (
    <div className="w-full bg-white dark:bg-slate-800 rounded-xl shadow-lg p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
        Activity
      </h2>
      <div className="h-44 overflow-y-auto flex flex-col gap-0.5 font-mono text-xs">
        {logs.length === 0 ? (
          <p className="text-slate-400 dark:text-slate-500 text-center mt-10">
            No activity yet
          </p>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              className="text-slate-600 dark:text-slate-400 leading-relaxed"
            >
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
