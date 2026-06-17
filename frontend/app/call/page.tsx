"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";

import { WS_BASE } from "@/lib/config";
import { getCallerTickets } from "@/lib/api";
import type { CallerTicket } from "@/lib/types";
import { useAudioStream } from "@/lib/hooks/useAudioStream";
import { SessionDetailPanel } from "@/components/admin/SessionDetailPanel";
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUICK_NUMBERS = ["9300499439", "9999911111", "9999922222"];

function isValidPhone(v: string) {
  return /^\d{10}$/.test(v);
}

// ---------------------------------------------------------------------------
// Ticket panel
// ---------------------------------------------------------------------------

const STATUS_STYLES: Record<string, string> = {
  open:        "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  in_review:   "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  in_progress: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  resolved:    "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
  closed:      "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
};

type TicketView =
  | { kind: "list" }
  | { kind: "ticket"; id: number }
  | { kind: "session"; sid: string; fromTicket: number };

function CallerTicketPanel({
  tickets,
  loading,
}: {
  tickets: CallerTicket[];
  loading: boolean;
}) {
  const [view, setView] = useState<TicketView>({ kind: "list" });

  // Reset to list when ticket data refreshes (e.g. after a call ends)
  const prevTicketsRef = useRef(tickets);
  useEffect(() => {
    if (prevTicketsRef.current !== tickets) {
      prevTicketsRef.current = tickets;
      setView({ kind: "list" });
    }
  }, [tickets]);

  // ── Session detail view ──────────────────────────────────────────────────
  if (view.kind === "session") {
    return (
      <div className="overflow-y-auto">
        <SessionDetailPanel
          sessionId={view.sid}
          onBack={() => setView({ kind: "ticket", id: view.fromTicket })}
        />
      </div>
    );
  }

  // ── Ticket detail view ───────────────────────────────────────────────────
  if (view.kind === "ticket") {
    const ticket = tickets.find((t) => t.id === view.id);
    if (!ticket) {
      setView({ kind: "list" });
      return null;
    }
    const statusCls = STATUS_STYLES[ticket.status] ?? STATUS_STYLES.open;
    const descLines = (ticket.description ?? "").split("\n").filter(Boolean);

    return (
      <div className="p-4 flex flex-col gap-4 overflow-y-auto">
        {/* Back */}
        <button
          onClick={() => setView({ kind: "list" })}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors self-start"
        >
          <span className="text-base leading-none">←</span>
          All Tickets
        </button>

        {/* Header */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-bold text-slate-700 dark:text-slate-300">
            #{ticket.id}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${statusCls}`}>
            {ticket.status.replace("_", " ")}
          </span>
          <span className="text-xs text-slate-400 capitalize">{ticket.priority}</span>
        </div>

        {/* Description */}
        {descLines.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Description
            </span>
            <div className="flex flex-col gap-0.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2.5">
              {descLines.map((line, i) => (
                <p key={i} className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                  {line}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Dates */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex flex-col gap-0.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2">
            <span className="text-xs text-slate-400">Created</span>
            <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
              {new Date(ticket.created_at).toLocaleDateString()}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2">
            <span className="text-xs text-slate-400">Updated</span>
            <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
              {new Date(ticket.updated_at).toLocaleDateString()}
            </span>
          </div>
        </div>

        {/* Session IDs */}
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Sessions ({ticket.session_ids.length})
          </span>
          {ticket.session_ids.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No sessions linked</p>
          ) : (
            <div className="flex flex-col gap-1">
              {ticket.session_ids.map((sid) => (
                <button
                  key={sid}
                  onClick={() => setView({ kind: "session", sid, fromTicket: ticket.id })}
                  className="font-mono text-xs bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg px-3 py-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 truncate text-left transition-colors"
                  title="View session"
                >
                  {sid}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Ticket list view (default) ────────────────────────────────────────────
  return (
    <div className="p-4 flex flex-col gap-3 overflow-y-auto">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Your Previous Tickets
        </span>
        {loading && <SpinnerIcon className="w-3.5 h-3.5 animate-spin text-slate-400" />}
      </div>

      {!loading && tickets.length === 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500 italic">
          No tickets found for this number.
        </p>
      )}

      {tickets.map((ticket) => {
        const statusCls = STATUS_STYLES[ticket.status] ?? STATUS_STYLES.open;
        const descLines = (ticket.description ?? "").split("\n").filter(Boolean);
        return (
          <button
            key={ticket.id}
            onClick={() => setView({ kind: "ticket", id: ticket.id })}
            className="w-full text-left flex flex-col gap-2 bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl px-4 py-3 border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs font-bold text-slate-500 dark:text-slate-400">
                #{ticket.id}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-400 dark:text-slate-500 capitalize">
                  {ticket.priority}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${statusCls}`}>
                  {ticket.status.replace("_", " ")}
                </span>
              </div>
            </div>
            {descLines.length > 0 && (
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed truncate">
                {descLines[0]}
              </p>
            )}
            <div className="flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
              <span className="font-mono">{new Date(ticket.created_at).toLocaleDateString()}</span>
              <span>{ticket.session_ids.length} session{ticket.session_ids.length !== 1 ? "s" : ""}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CallPage() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [tickets, setTickets] = useState<CallerTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);

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
        if (msg.includes("4000")) {
          addLog("Call rejected: phone must be exactly 10 digits");
        } else {
          addLog(msg);
        }
      },
    });

  const isActive = status === "active";
  const isConnecting = status === "connecting";

  const loadTickets = useCallback((ph: string) => {
    setTicketsLoading(true);
    getCallerTickets(ph)
      .then((data) => { setTickets(data); setTicketsLoading(false); })
      .catch(() => { setTickets([]); setTicketsLoading(false); });
  }, []);

  const handlePhoneChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 10);
    setPhone(digits);
    if (isValidPhone(digits)) loadTickets(digits);
  };

  const selectPhone = (n: string) => {
    setPhone(n);
    if (isValidPhone(n)) loadTickets(n);
  };

  const canCall = isValidPhone(phone);

  const startCall = () => {
    if (!canCall) return;
    connect(`${WS_BASE}/call?phone=${phone}`);
  };

  // Re-fetch after a call ends so newly created tickets appear
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const wasActive = prevStatusRef.current === "active";
    prevStatusRef.current = status;
    if (wasActive && status === "disconnected" && isValidPhone(phone)) {
      loadTickets(phone);
    }
  }, [status, phone, loadTickets]);

  return (
    <div className="min-h-screen flex items-start justify-center bg-linear-to-br from-blue-50 to-indigo-100 dark:from-slate-900 dark:to-slate-800 p-4 pt-8">
      <div className="flex flex-col lg:flex-row gap-6 w-full max-w-4xl">

        {/* ── Left column: call controls ── */}
        <div className="flex flex-col gap-6 w-full lg:max-w-md">
          <div className="text-center">
            <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-2">
              Vaani Helpline
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400">
              Report an issue or track your case
            </p>
          </div>

          {/* Phone input */}
          {!isActive && (
            <div className="w-full bg-white dark:bg-slate-800 rounded-xl shadow-lg p-5 flex flex-col gap-3">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                Your Phone Number
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
              <div className="flex flex-col gap-1">
                <span className="text-xs text-slate-400">Quick select</span>
                <div className="flex flex-wrap gap-2">
                  {QUICK_NUMBERS.map((n) => (
                    <button
                      key={n}
                      onClick={() => selectPhone(n)}
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

          {/* Status & controls */}
          <div className="w-full bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 flex flex-col gap-5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Status</span>
              <StatusBadge status={status} />
            </div>

            {isActive && phone && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400 shrink-0">Phone</span>
                <span className="text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded">
                  {phone}
                </span>
              </div>
            )}

            {sessionId && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400 shrink-0">Session</span>
                <span className="text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded truncate">
                  {sessionId}
                </span>
              </div>
            )}

            {isActive && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">Speaking</span>
                <SpeakerBadge speaker={speaker} />
              </div>
            )}

            <div className="flex flex-col items-center gap-3 py-4">
              <div className="flex items-center gap-6">
                <button
                  onClick={isActive ? disconnect : startCall}
                  disabled={isConnecting || (!isActive && !canCall)}
                  aria-label={isActive ? "End call" : "Start call"}
                  className={`w-24 h-24 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed text-white ${
                    isActive ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"
                  }`}
                >
                  {isConnecting ? <SpinnerIcon /> : isActive ? <EndCallIcon /> : <PhoneIcon />}
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
                  ? muted ? "Muted" : "Tap to end call"
                  : isConnecting ? "Connecting..."
                  : canCall ? "Tap to start call"
                  : "Enter your phone number to call"}
              </p>
            </div>
          </div>

          <ActivityLog logs={logs} />

          <Link
            href="/"
            className="px-6 py-3 bg-slate-600 hover:bg-slate-700 text-white font-semibold rounded-lg transition-colors text-center"
          >
            ← Back to Home
          </Link>
        </div>

        {/* ── Right column: ticket panel (only when phone is valid) ── */}
        {canCall && (
          <div className="w-full lg:flex-1 bg-white dark:bg-slate-800 rounded-xl shadow-lg overflow-hidden flex flex-col lg:min-h-128 lg:max-h-[calc(100vh-4rem)]">
            <CallerTicketPanel tickets={tickets} loading={ticketsLoading} />
          </div>
        )}

      </div>
    </div>
  );
}
