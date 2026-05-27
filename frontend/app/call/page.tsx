"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

import { WS_BASE } from "@/lib/config";
import { useAudioStream } from "@/lib/hooks/useAudioStream";
import type { SpeakerState } from "@/lib/hooks/useAudioStream";

export default function CallPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev].slice(0, 100));
  }, []);

  const { status, speaker, muted, connect, disconnect, toggleMute } =
    useAudioStream({
      enableMute: true,
      enableBargeIn: true,
      ttsLookaheadSeconds: 0.05,
      onServerMessage: (msg) => {
        if (msg.type === "metadata" && typeof msg.session_id === "string") {
          setSessionId(msg.session_id);
          addLog(`Session ID: ${msg.session_id}`);
        }
      },
      onLog: addLog,
    });

  const isActive = status === "active";
  const isConnecting = status === "connecting";
  // Treat 'error' the same as 'disconnected' for button state
  const isDisabled = isConnecting;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-linear-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="flex flex-col items-center gap-6 w-full max-w-lg">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
            Call
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">
            Real-time audio session
          </p>
        </div>

        {/* Status & controls card */}
        <div className="w-full bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Status
            </span>
            <StatusBadge status={status} />
          </div>

          {sessionId && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400 shrink-0">
                Session
              </span>
              <span className="text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded truncate">
                {sessionId}
              </span>
            </div>
          )}

          {isActive && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Speaking
              </span>
              <SpeakerBadge speaker={speaker} />
            </div>
          )}

          <div className="flex flex-col items-center gap-3 py-4">
            <div className="flex items-center gap-6">
              <button
                onClick={isActive ? disconnect : () => connect(`${WS_BASE}/call`)}
                disabled={isDisabled}
                aria-label={isActive ? "End call" : "Start call"}
                className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-white ${
                  isActive
                    ? "bg-red-500 hover:bg-red-600"
                    : "bg-green-500 hover:bg-green-600"
                }`}
              >
                {isConnecting ? (
                  <SpinnerIcon />
                ) : isActive ? (
                  <EndCallIcon />
                ) : (
                  <PhoneIcon />
                )}
              </button>

              {isActive && (
                <button
                  onClick={() => toggleMute()}
                  aria-label={muted ? "Unmute" : "Mute"}
                  className={`w-14 h-14 rounded-full flex items-center justify-center shadow-md transition-all active:scale-95 ${
                    muted
                      ? "bg-slate-700 hover:bg-slate-800 text-white"
                      : "bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500 text-slate-700 dark:text-white"
                  }`}
                >
                  {muted ? <MutedIcon /> : <MicIcon />}
                </button>
              )}
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {isActive
                ? muted
                  ? "Muted"
                  : "Tap to end call"
                : isConnecting
                ? "Connecting..."
                : "Tap to start call"}
            </p>
          </div>
        </div>

        {/* Activity log */}
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

// ---------------------------------------------------------------------------
// Badge sub-components
// ---------------------------------------------------------------------------

// Call page labels: outgoing mic activity = "USER", incoming TTS = "AGENT"
function SpeakerBadge({ speaker }: { speaker: SpeakerState }) {
  const styles: Record<SpeakerState, { label: string; cls: string; dot?: string }> = {
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
  const { label, cls, dot } = styles[speaker];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold tracking-wide ${cls}`}
    >
      {dot && <span className={`w-2 h-2 rounded-full animate-pulse ${dot}`} />}
      {label}
    </span>
  );
}

type CallStatusType = "idle" | "connecting" | "active" | "disconnected" | "error";

function StatusBadge({ status }: { status: CallStatusType }) {
  const styles: Record<CallStatusType, { label: string; cls: string }> = {
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
  const { label, cls } = styles[status];
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

// ---------------------------------------------------------------------------
// Icon sub-components
// ---------------------------------------------------------------------------

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-9 h-9 fill-current">
      <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z" />
    </svg>
  );
}

function EndCallIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-9 h-9 fill-current">
      <path d="M6 6h12v12H6z" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      className="w-9 h-9 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
    >
      <circle cx={12} cy={12} r={10} strokeOpacity={0.25} />
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
      <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1.5 17.93A8.001 8.001 0 0 1 4 11H2a10 10 0 0 0 9 9.95V23h2v-2.05A10 10 0 0 0 22 11h-2a8 8 0 0 1-6.5 7.93V19h-3v-0.07z" />
    </svg>
  );
}

function MutedIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current">
      <path d="M3.71 2.29a1 1 0 0 0-1.42 1.42l18 18a1 1 0 0 0 1.42-1.42l-18-18zM12 1a4 4 0 0 1 4 4v.18l-8 8V5a4 4 0 0 1 4-4zm4 12.46A4 4 0 0 1 8 11V9.46l8 8zM4 11H2a10 10 0 0 0 9 9.95V23h2v-2.05A10 10 0 0 0 22 11h-2a8 8 0 0 1-14.27 3.7L4 11z" />
    </svg>
  );
}
