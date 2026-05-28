import type { SpeakerState } from "@/lib/hooks/useAudioStream";

// Call page labels: outgoing mic = "USER", incoming TTS = "AGENT"
const SPEAKER_STYLES: Record<
  SpeakerState,
  { label: string; cls: string; dot?: string }
> = {
  silent: {
    label: "SILENT",
    cls: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
  },
  outgoing: {
    label: "USER",
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    dot: "bg-blue-500",
  },
  incoming: {
    label: "AGENT",
    cls: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
    dot: "bg-purple-500",
  },
};

export function SpeakerBadge({ speaker }: { speaker: SpeakerState }) {
  const { label, cls, dot } = SPEAKER_STYLES[speaker];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide ${cls}`}
    >
      {dot && <span className={`w-2 h-2 rounded-full animate-pulse ${dot}`} />}
      {label}
    </span>
  );
}
