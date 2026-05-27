import type { Phase, Sentiment, Urgency, WsStatus, Session } from "@/lib/types";
import type { SpeakerState } from "@/lib/hooks/useAudioStream";
import { UserIcon } from "@/components/ui/icons";

// ---------------------------------------------------------------------------
// PhaseBadge
// ---------------------------------------------------------------------------

const PHASE_STYLES: Record<Phase, string> = {
  GREETING: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  CAPTURE: "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
  VALIDATION: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  DECISION: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  COMPLETE: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
};

export function PhaseBadge({ phase }: { phase: Phase }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-semibold tracking-wide ${PHASE_STYLES[phase]}`}
    >
      {phase}
    </span>
  );
}

// ---------------------------------------------------------------------------
// SentimentBadge
// ---------------------------------------------------------------------------

const SENTIMENT_STYLES: Record<Sentiment, string> = {
  neutral: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  calm: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  anxious: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  angry: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

export function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${SENTIMENT_STYLES[sentiment]}`}
    >
      {sentiment}
    </span>
  );
}

// ---------------------------------------------------------------------------
// UrgencyBadge
// ---------------------------------------------------------------------------

const URGENCY_STYLES: Record<Urgency, string> = {
  none: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
  low: "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  high: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

const URGENCY_LABELS: Record<Urgency, string> = {
  none: "No urgency",
  low: "Low urgency",
  medium: "Medium urgency",
  high: "High urgency",
};

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${URGENCY_STYLES[urgency]}`}
    >
      {URGENCY_LABELS[urgency]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ConfidenceBadge
// ---------------------------------------------------------------------------

const CONFIDENCE_STYLES: Record<"GREEN" | "YELLOW" | "RED", string> = {
  GREEN: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  YELLOW: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  RED: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
};

export function ConfidenceBadge({
  label,
  level,
}: {
  label: string;
  level: "GREEN" | "YELLOW" | "RED";
}) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-semibold ${CONFIDENCE_STYLES[level]}`}
    >
      {label} confidence: {level}
    </span>
  );
}

// ---------------------------------------------------------------------------
// QueryTypeBadge
// ---------------------------------------------------------------------------

const QUERY_TYPE_STYLES: Record<string, { badge: string; label: string }> = {
  EMERGENCY: {
    badge: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
    label: "Emergency",
  },
  MUNICIPALITY: {
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    label: "Municipality",
  },
  GENERAL: {
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
    label: "General",
  },
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
  police: "Police",
  medical: "Medical",
  fire: "Fire",
  disaster_relief: "Disaster Relief",
};

export function QueryTypeBadge({
  session,
  compact,
}: {
  session: Session;
  compact?: boolean;
}) {
  const qt = session.query_type;
  if (!qt) return null;

  const { badge, label } = QUERY_TYPE_STYLES[qt] ?? {
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
    label: qt,
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge}`}>
          {label}
        </span>
        {qt === "EMERGENCY" && session.service_type && (
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800">
            {SERVICE_TYPE_LABELS[session.service_type] ?? session.service_type}
          </span>
        )}
      </div>
      {session.location && (
        <p
          className={`text-xs text-slate-500 dark:text-slate-400 ${compact ? "truncate" : ""}`}
        >
          📍 {session.location}
        </p>
      )}
      {qt === "MUNICIPALITY" && session.since_when && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Since: {session.since_when}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WsStatusBadge
// ---------------------------------------------------------------------------

const WS_STATUS_STYLES: Record<WsStatus, { label: string; cls: string }> = {
  connecting: {
    label: "Connecting",
    cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300",
  },
  connected: {
    label: "Live",
    cls: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  },
  disconnected: {
    label: "Disconnected",
    cls: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  },
  error: {
    label: "Error",
    cls: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  },
};

export function WsStatusBadge({
  status,
  onReconnect,
}: {
  status: WsStatus;
  onReconnect: () => void;
}) {
  const { label, cls } = WS_STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}
    >
      {status === "connected" && (
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
      )}
      {label}
      {(status === "disconnected" || status === "error") && (
        <button
          onClick={onReconnect}
          className="underline text-xs ml-0.5 hover:no-underline"
        >
          Retry
        </button>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// TakeoverSpeakerBadge
// Admin takeover labels: outgoing = "Human Agent" (you), incoming = "User" (caller)
// ---------------------------------------------------------------------------

const TAKEOVER_SPEAKER_STYLES: Record<
  Exclude<SpeakerState, "silent">,
  { label: string; cls: string; dot: string }
> = {
  outgoing: {
    label: "Human Agent",
    cls: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300",
    dot: "bg-indigo-500",
  },
  incoming: {
    label: "User",
    cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
    dot: "bg-blue-500",
  },
};

export function TakeoverSpeakerBadge({ speaker }: { speaker: SpeakerState }) {
  if (speaker === "silent") return null;
  const { label, cls, dot } = TAKEOVER_SPEAKER_STYLES[speaker];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${dot}`} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// LiveSpeakerIndicators (inline speaking dots used in cards and detail panel)
// ---------------------------------------------------------------------------

export function LiveSpeakerIndicators({ session }: { session: Session }) {
  return (
    <>
      {session.caller_speaking && (
        <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          Caller
        </span>
      )}
      {session.ai_speaking && (
        <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Agent
        </span>
      )}
      {session.human_speaking && (
        <span className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
          Human
        </span>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// ClaimedByBadge (takeover claimed-by indicator)
// ---------------------------------------------------------------------------

export function ClaimedByBadge({ claimedBy }: { claimedBy: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium">
      <UserIcon />
      Claimed by <span className="font-semibold">{claimedBy}</span>
    </span>
  );
}
