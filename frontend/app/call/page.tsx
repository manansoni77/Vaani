"use client";

import { useState, useCallback } from "react";
import Link from "next/link";

import { WS_BASE } from "@/lib/config";
import { useAudioStream } from "@/lib/hooks/useAudioStream";
import { StatusBadge } from "@/components/call/StatusBadge";
import { SpeakerBadge } from "@/components/call/SpeakerBadge";
import { ActivityLog } from "@/components/call/ActivityLog";
import {
  PhoneIcon,
  EndCallIcon,
  SpinnerIcon,
  MicIcon,
  MutedIcon,
} from "@/components/ui/icons";

const QUICK_NUMBERS = ["9300499439", "9999911111", "9999922222"];

function isValidPhone(v: string) {
  return /^\d{10}$/.test(v);
}

export default function CallPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [phone, setPhone] = useState("");

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
      onLog: (msg) => {
        // Surface close code 4000 (invalid phone) as a readable log line
        if (msg.includes("4000")) {
          addLog("Call rejected: phone must be exactly 10 digits");
        } else {
          addLog(msg);
        }
      },
    });

  const isActive = status === "active";
  const isConnecting = status === "connecting";
  const canCall = isValidPhone(phone);

  const handlePhoneChange = (value: string) => {
    // Allow only digits, max 10
    setPhone(value.replace(/\D/g, "").slice(0, 10));
  };

  const startCall = () => {
    if (!canCall) return;
    connect(`${WS_BASE}/call?phone=${phone}`);
  };

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

        {/* Phone input — only shown when not on a call */}
        {!isActive && (
          <div className="w-full bg-white dark:bg-slate-800 rounded-xl shadow-lg p-5 flex flex-col gap-3">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Caller Phone Number
            </label>

            <input
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="10-digit number"
              maxLength={10}
              disabled={isConnecting}
              className={`w-full px-4 py-2.5 text-lg font-mono rounded-lg border bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 transition-colors disabled:opacity-50 ${
                phone.length > 0 && !canCall
                  ? "border-red-400 focus:ring-red-400"
                  : "border-slate-300 dark:border-slate-600 focus:ring-blue-400"
              }`}
            />

            {phone.length > 0 && !canCall && (
              <p className="text-xs text-red-500">Must be exactly 10 digits</p>
            )}

            {/* Quick-select list */}
            <div className="flex flex-col gap-1">
              <span className="text-xs text-slate-400">Quick select</span>
              <div className="flex flex-wrap gap-2">
                {QUICK_NUMBERS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setPhone(n)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors ${
                      phone === n
                        ? "bg-blue-600 border-blue-600 text-white"
                        : "bg-slate-50 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-blue-400"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Status & controls card */}
        <div className="w-full bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Status
            </span>
            <StatusBadge status={status} />
          </div>

          {isActive && phone && (
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400 shrink-0">
                Phone
              </span>
              <span className="text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                {phone}
              </span>
            </div>
          )}

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
                onClick={isActive ? disconnect : startCall}
                disabled={isConnecting || (!isActive && !canCall)}
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
                  : canCall
                    ? "Tap to start call"
                    : "Enter a phone number to call"}
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
