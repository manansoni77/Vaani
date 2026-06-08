"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/contexts/SessionContext";
import type { Session } from "@/lib/types";
import { formatDuration } from "@/lib/utils";
import { SpinnerIcon, CopyIcon, CheckIcon } from "@/components/ui/icons";
import {
  PhaseBadge,
  SentimentBadge,
  UrgencyBadge,
  ConfidenceBadge,
  QueryTypeBadge,
} from "@/components/admin/badges";

interface Props {
  sessionId: string;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function SessionDetailPanel({ sessionId, onBack }: Props) {
  const { fetchSession } = useSession();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSession(null);
    fetchSession(sessionId)
      .then(setSession)
      .catch(() => setError("Session not found or you do not have access to it."))
      .finally(() => setLoading(false));
  }, [sessionId, fetchSession]);

  const copyId = () => {
    navigator.clipboard.writeText(sessionId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const backBtn = (
    <button
      onClick={onBack}
      className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors"
    >
      <span className="text-base leading-none">←</span>
      Back to Ticket
    </button>
  );

  if (loading) {
    return (
      <div className="p-4 flex flex-col gap-4 min-w-0">
        {backBtn}
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-8 justify-center">
          <SpinnerIcon className="w-4 h-4 animate-spin" />
          Loading session…
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="p-4 flex flex-col gap-4 min-w-0">
        {backBtn}
        <p className="text-sm text-red-500 dark:text-red-400">
          {error ?? "Session not found."}
        </p>
      </div>
    );
  }

  const transcriptLines = (session.transcript ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div className="p-4 flex flex-col gap-5 min-w-0">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        {backBtn}
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Session
        </span>
      </div>

      {/* ── Session ID ── */}
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
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
      </div>

      {/* ── Caller ── */}
      {session.phone_number && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Caller
          </span>
          <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2">
            <span className="font-mono text-sm text-slate-700 dark:text-slate-300">
              {session.phone_number}
            </span>
            {session.caller_id != null && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                #{session.caller_id}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Status ── */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Status
        </span>
        <div className="flex flex-wrap gap-1.5">
          <PhaseBadge phase={session.phase} />
          {session.language && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {session.language}
            </span>
          )}
        </div>
      </div>

      {/* ── Caller Signals ── */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Caller Signals
        </span>
        <div className="flex flex-wrap gap-1.5">
          <SentimentBadge sentiment={session.sentiment} />
          <UrgencyBadge urgencyScore={session.urgency_score} />
          {session.human_requested && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300 font-semibold">
              Human Requested
            </span>
          )}
        </div>
      </div>

      {/* ── Query ── */}
      {session.query_type && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Query
          </span>
          <QueryTypeBadge session={session} />
        </div>
      )}

      {/* ── Timeline ── */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Duration & Timeline
        </span>
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
        {(session.started_at || session.ended_at) && (
          <div className="flex flex-col gap-1 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2.5">
            {session.started_at && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Started</span>
                <span className="font-mono text-slate-600 dark:text-slate-300">
                  {new Date(session.started_at).toLocaleString()}
                </span>
              </div>
            )}
            {session.ended_at && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Ended</span>
                <span className="font-mono text-slate-600 dark:text-slate-300">
                  {new Date(session.ended_at).toLocaleString()}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Intelligence ── */}
      {(session.summary || session.intent || session.key_details ||
        session.system_score != null || session.user_score != null) && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Intelligence
          </span>
          {session.summary && (
            <div className="flex flex-col gap-0.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2.5">
              <span className="text-xs text-slate-400">Summary</span>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {session.summary}
              </p>
            </div>
          )}
          {session.intent && (
            <div className="flex flex-col gap-0.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2.5">
              <span className="text-xs text-slate-400">Intent</span>
              <p className="text-xs text-slate-700 dark:text-slate-300">{session.intent}</p>
            </div>
          )}
          {session.key_details && (
            <div className="flex flex-col gap-0.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2.5">
              <span className="text-xs text-slate-400">Key Details</span>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {session.key_details}
              </p>
            </div>
          )}
          {(session.system_score != null || session.user_score != null) && (
            <div className="flex flex-wrap gap-1.5">
              <ConfidenceBadge label="AI" score={session.system_score ?? null} />
              <ConfidenceBadge label="User" score={session.user_score ?? null} />
            </div>
          )}
        </div>
      )}

      {/* ── Recording ── */}
      {(session.audio_mixed_url || session.audio_url) && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Recording
          </span>
          <audio
            controls
            src={session.audio_mixed_url ?? session.audio_url ?? undefined}
            className="w-full rounded-lg"
          />
          {session.audio_mixed_url && session.audio_url && (
            <a
              href={session.audio_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 underline"
            >
              Caller-only audio
            </a>
          )}
        </div>
      )}

      {/* ── Transcript ── */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Transcript
        </span>
        {transcriptLines.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">No transcript</p>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-80 overflow-y-auto">
            {transcriptLines.map((line, i) => {
              const match = line.match(/^(\w+)(?:\s*\(([^)]+)\))?:\s*(.*)/i);
              const role = match?.[1]?.toLowerCase() ?? "";
              const turnSentiment = match?.[2] ?? null;
              const text = match?.[3] ?? line;

              const isAgent = role === "agent";
              const isUser = role === "user";
              const isHuman = role === "human";

              const sentimentCls =
                turnSentiment?.toLowerCase() === "angry"
                  ? "text-red-600 dark:text-red-400"
                  : turnSentiment?.toLowerCase() === "anxious"
                    ? "text-amber-600 dark:text-amber-400"
                    : turnSentiment?.toLowerCase() === "calm"
                      ? "text-green-600 dark:text-green-400"
                      : "opacity-60";

              const cls = isAgent
                ? "bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300"
                : isHuman
                  ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300"
                  : isUser
                    ? "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300"
                    : "text-slate-500 dark:text-slate-400 italic";

              const label = isAgent ? "Agent" : isHuman ? "Human" : isUser ? "User" : null;

              return (
                <div key={i} className={`text-xs px-3 py-2 rounded-lg leading-relaxed ${cls}`}>
                  {label && (
                    <span className="font-semibold text-xs uppercase tracking-wide block mb-0.5 opacity-60">
                      {label}
                      {turnSentiment && (
                        <span className={`normal-case font-normal ml-1 ${sentimentCls}`}>
                          ({turnSentiment})
                        </span>
                      )}
                    </span>
                  )}
                  {text}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
