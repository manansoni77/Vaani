"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";

import { API_BASE, WS_BASE } from "@/lib/config";

type Phase = "GREETING" | "CAPTURE" | "VALIDATION" | "DECISION" | "COMPLETE";
type Sentiment = "neutral" | "calm" | "anxious" | "angry";
type Urgency = "none" | "low" | "medium" | "high";
type WsStatus = "connecting" | "connected" | "disconnected" | "error";

interface SessionStatus {
  session_id: string;
  phase: Phase;
  speaking: boolean;
  duration_s: number;
  turns: number;
  sentiment: Sentiment;
  urgency_level: Urgency;
  human_requested: boolean;
  transcript_snippet: string;
  timestamp: string;
}

interface SessionEvent extends SessionStatus {
  event_type: "session_started" | "session_updated" | "session_ended";
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function AdminPage() {
  const [sessions, setSessions] = useState<Record<string, SessionStatus>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);

  const connect = useCallback(() => {
    wsRef.current?.close();
    const ws = new WebSocket(`${WS_BASE}/sessions/stream`);
    wsRef.current = ws;

    ws.onopen = () => setWsStatus("connected");

    ws.onmessage = (e) => {
      try {
        const event: SessionEvent = JSON.parse(e.data as string);
        if (event.event_type === "session_ended") {
          setSessions((prev) => {
            const next = { ...prev };
            delete next[event.session_id];
            return next;
          });
          setSelected((sel) => (sel === event.session_id ? null : sel));
        } else {
          setSessions((prev) => ({ ...prev, [event.session_id]: event }));
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onerror = () => setWsStatus("error");
    ws.onclose = () => setWsStatus((s) => (s === "connecting" ? "error" : "disconnected"));
  }, []);

  useEffect(() => {
    // Seed from REST as fallback in case WS is slow
    fetch(`${API_BASE}/sessions`)
      .then((r) => r.json())
      .then((data: SessionStatus[]) => {
        setSessions((prev) => {
          const next = { ...prev };
          for (const s of data) next[s.session_id] = s;
          return next;
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  const sessionList = Object.values(sessions);
  const selectedSession = selected ? sessions[selected] : null;

  return (
    <div className="h-screen flex flex-col bg-linear-to-br from-green-50 to-emerald-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between px-5 py-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            Admin Dashboard
          </h1>
          <WsStatusBadge
            status={wsStatus}
            onReconnect={() => { setWsStatus("connecting"); connect(); }}
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {sessionList.length} active{" "}
            {sessionList.length === 1 ? "call" : "calls"}
          </span>
          <Link
            href="/"
            className="px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            ← Back
          </Link>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Card grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {sessionList.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 gap-2">
              <p className="text-base font-medium">No active calls</p>
              <p className="text-sm">
                Sessions will appear here as calls connect
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sessionList.map((s) => (
                <SessionCard
                  key={s.session_id}
                  session={s}
                  selected={selected === s.session_id}
                  onClick={() =>
                    setSelected((prev) =>
                      prev === s.session_id ? null : s.session_id
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div
          className={`shrink-0 border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-y-auto transition-all duration-300 ${
            selectedSession ? "w-80 xl:w-96" : "w-0"
          }`}
        >
          {selectedSession && (
            <DetailPanel
              session={selectedSession}
              onClose={() => setSelected(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// --- Child components ---

function WsStatusBadge({
  status,
  onReconnect,
}: {
  status: WsStatus;
  onReconnect: () => void;
}) {
  const styles: Record<WsStatus, { label: string; cls: string }> = {
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
  const { label, cls } = styles[status];
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

function SessionCard({
  session,
  selected,
  onClick,
}: {
  session: SessionStatus;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 flex flex-col gap-3 transition-all hover:shadow-md ${
        selected
          ? "border-green-500 bg-green-50 dark:bg-green-950/30 shadow-md ring-1 ring-green-500/30"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600"
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-slate-400 dark:text-slate-500 truncate">
          {session.session_id.slice(0, 12)}…
        </span>
        {session.speaking && (
          <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-semibold shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            Speaking
          </span>
        )}
      </div>

      {/* Badges */}
      <div className="flex flex-wrap gap-1.5">
        <PhaseBadge phase={session.phase} />
        <SentimentBadge sentiment={session.sentiment} />
        <UrgencyBadge urgency={session.urgency_level} />
        {session.human_requested && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 font-semibold">
            Human Req.
          </span>
        )}
      </div>

      {/* Transcript snippet */}
      {session.transcript_snippet && (
        <p className="text-xs text-slate-500 dark:text-slate-400 italic line-clamp-2 leading-relaxed">
          &ldquo;{session.transcript_snippet}&rdquo;
        </p>
      )}

      {/* Footer */}
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

function DetailPanel({
  session,
  onClose,
}: {
  session: SessionStatus;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyId = () => {
    navigator.clipboard.writeText(session.session_id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="p-4 flex flex-col gap-5 min-w-0">
      {/* Panel header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
          Session Detail
        </h2>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          aria-label="Close panel"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current">
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
          </svg>
        </button>
      </div>

      {/* Session ID */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Session ID
        </span>
        <div className="flex items-start gap-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2">
          <span className="font-mono text-xs text-slate-700 dark:text-slate-300 break-all flex-1 leading-relaxed">
            {session.session_id}
          </span>
          <button
            onClick={copyId}
            className="shrink-0 mt-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            title="Copy session ID"
          >
            {copied ? (
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-green-500">
                <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-current">
                <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
                <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Phase & speaking */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Status
        </span>
        <div className="flex flex-wrap gap-1.5">
          <PhaseBadge phase={session.phase} />
          {session.speaking && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              Speaking
            </span>
          )}
        </div>
      </div>

      {/* Caller signals */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Caller Signals
        </span>
        <div className="flex flex-wrap gap-1.5">
          <SentimentBadge sentiment={session.sentiment} />
          <UrgencyBadge urgency={session.urgency_level} />
          {session.human_requested && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 font-semibold">
              Human Requested
            </span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2.5">
          <span className="text-xs text-slate-400">Duration</span>
          <span className="text-lg font-bold text-slate-800 dark:text-slate-200 font-mono">
            {formatDuration(session.duration_s)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2.5">
          <span className="text-xs text-slate-400">Turns</span>
          <span className="text-lg font-bold text-slate-800 dark:text-slate-200 font-mono">
            {session.turns}
          </span>
        </div>
      </div>

      {/* Transcript */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Last Transcript
        </span>
        {session.transcript_snippet ? (
          <p className="text-sm text-slate-700 dark:text-slate-300 italic bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2.5 leading-relaxed">
            &ldquo;{session.transcript_snippet}&rdquo;
          </p>
        ) : (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            No transcript yet
          </p>
        )}
      </div>

      {/* Last updated */}
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Last Updated
        </span>
        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
          {new Date(session.timestamp).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}

// --- Badge components ---

function PhaseBadge({ phase }: { phase: Phase }) {
  const styles: Record<Phase, string> = {
    GREETING:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
    CAPTURE:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300",
    VALIDATION:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    DECISION:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
    COMPLETE:
      "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-semibold tracking-wide ${styles[phase]}`}
    >
      {phase}
    </span>
  );
}

function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const styles: Record<Sentiment, string> = {
    neutral:
      "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
    calm: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
    anxious:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    angry: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[sentiment]}`}
    >
      {sentiment}
    </span>
  );
}

function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const styles: Record<Urgency, string> = {
    none: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
    low: "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300",
    medium:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    high: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  };
  const labels: Record<Urgency, string> = {
    none: "No urgency",
    low: "Low",
    medium: "Medium",
    high: "High urgency",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[urgency]}`}
    >
      {labels[urgency]}
    </span>
  );
}
