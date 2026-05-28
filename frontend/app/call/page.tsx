"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

import { WS_BASE } from "@/lib/config";
import { useAudioStream } from "@/lib/hooks/useAudioStream";
import { StatusBadge } from "@/components/call/StatusBadge";
import { SpeakerBadge } from "@/components/call/SpeakerBadge";
import { ActivityLog } from "@/components/call/ActivityLog";
import { PhoneIcon, EndCallIcon, SpinnerIcon, MicIcon, MutedIcon } from "@/components/ui/icons";

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

          {/* Call controls */}
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
                  {muted
                    ? <MutedIcon />
                    : <MicIcon />
                  }
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

        <ActivityLog logs={logs} />

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
