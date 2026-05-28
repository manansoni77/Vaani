import type { AudioStreamStatus } from "@/lib/hooks/useAudioStream";

const STATUS_STYLES: Record<AudioStreamStatus, { label: string; cls: string }> = {
  idle: {
    label: "Idle",
    cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  },
  connecting: {
    label: "Connecting",
    cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  },
  active: {
    label: "Active",
    cls: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  },
  disconnected: {
    label: "Disconnected",
    cls: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
  error: {
    label: "Error",
    cls: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
};

export function StatusBadge({ status }: { status: AudioStreamStatus }) {
  const { label, cls } = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${cls}`}
    >
      {status === "active" && (
        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      )}
      {label}
    </span>
  );
}
