const LEVEL_STYLES: Record<string, string> = {
  DEBUG: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
  INFO: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  WARNING: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  ERROR: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  CRITICAL: "bg-red-600 text-white dark:bg-red-700",
};

const FALLBACK_CLS =
  "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400";

export function LevelBadge({ level }: { level: string }) {
  const cls = LEVEL_STYLES[level] ?? FALLBACK_CLS;
  return (
    <span
      className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 tracking-wide ${cls}`}
    >
      {level}
    </span>
  );
}
