import type { Session } from "@/lib/types";
import { formatDuration } from "@/lib/utils";
import {
  PhaseBadge,
  SentimentBadge,
  UrgencyBadge,
  QueryTypeBadge,
  LiveSpeakerIndicators,
} from "@/components/admin/badges";

function transcriptPreview(transcript?: string): string {
  if (!transcript) return "";
  const lines = transcript.split("\n").filter(Boolean);
  const last = lines[lines.length - 1] ?? "";
  return last.replace(/^(user|agent|human):\s*/i, "");
}

interface Props {
  session: Session;
  live: boolean;
  selected: boolean;
  onClick: () => void;
}

export function SessionCard({ session, live, selected, onClick }: Props) {
  const preview = transcriptPreview(session.transcript);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 flex flex-col gap-3 transition-all hover:shadow-md ${
        selected
          ? "border-green-500 bg-green-50 dark:bg-green-950/30 shadow-md ring-1 ring-green-500/30"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600"
      }`}
    >
      {/* Top row: session ID + speaking indicators */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-slate-400 dark:text-slate-500 truncate">
          {session.session_id.slice(0, 12)}…
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {live && <LiveSpeakerIndicators session={session} />}
          {session.human_takeover && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 font-semibold">
              Taken Over
            </span>
          )}
          {!live && session.ended_at && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {new Date(session.ended_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-1.5">
        <PhaseBadge phase={session.phase} />
        <SentimentBadge sentiment={session.sentiment} />
        <UrgencyBadge urgencyScore={session.urgency_score} />
        {session.human_requested && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 font-semibold">
            Human Req.
          </span>
        )}
      </div>

      {session.query_type && <QueryTypeBadge session={session} compact />}

      {preview && (
        <p className="text-xs text-slate-500 dark:text-slate-400 italic line-clamp-2 leading-relaxed">
          &ldquo;{preview}&rdquo;
        </p>
      )}

      {/* Footer: duration + turns */}
      <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 font-mono mt-auto">
        <span>{formatDuration(session.duration_s)}</span>
        <span>·</span>
        <span>
          {session.turns} {session.turns === 1 ? "turn" : "turns"}
        </span>
      </div>
    </button>
  );
}
