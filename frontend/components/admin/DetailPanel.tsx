"use client";

import { useState, useEffect } from "react";

import { API_BASE, WS_BASE } from "@/lib/config";
import { formatDuration } from "@/lib/utils";
import { useAudioStream } from "@/lib/hooks/useAudioStream";
import type { Session } from "@/lib/types";
import { CloseIcon, CopyIcon, CheckIcon, MicIcon, MutedIcon, SpinnerIcon } from "@/components/ui/icons";
import {
  PhaseBadge,
  SentimentBadge,
  UrgencyBadge,
  ConfidenceBadge,
  QueryTypeBadge,
  TakeoverSpeakerBadge,
  ClaimedByBadge,
} from "@/components/admin/badges";

interface Props {
  session: Session;
  live: boolean;
  agentId: string;
  panelWidth: number;
  onClose: () => void;
}

export function DetailPanel({ session, live, agentId, panelWidth, onClose }: Props) {
  const twoCol = panelWidth >= 560;

  const [copied, setCopied] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);

  const {
    status: audioStatus,
    speaker: audioSpeaker,
    muted: audioMuted,
    connect: audioConnect,
    disconnect: audioDisconnect,
    toggleMute: audioToggleMute,
  } = useAudioStream({
    enableMute: true,
    enableBargeIn: false,
    ttsLookaheadSeconds: 0.05,
    onLog: (msg) => {
      if (
        msg.includes("denied") ||
        msg.includes("failed") ||
        msg.includes("not supported")
      ) {
        setAudioError(msg);
      }
    },
  });

  const audioConnected = audioStatus === "active";
  const isMyClaim = live && !!session.human_takeover && session.claimed_by === agentId;
  const isOthersClaim = live && !!session.human_takeover && session.claimed_by !== agentId;

  // Connect audio when this agent owns the claim; disconnect on release or unmount.
  useEffect(() => {
    if (!isMyClaim) {
      audioDisconnect();
      return;
    }
    const url = `${WS_BASE}/sessions/${session.session_id}/audio?agent_id=${encodeURIComponent(agentId)}`;
    audioConnect(url);
    return () => {
      audioDisconnect();
    };
  }, [isMyClaim, session.session_id, agentId, audioConnect, audioDisconnect]);

  const handleTakeover = async () => {
    setTakingOver(true);
    try {
      await fetch(`${API_BASE}/sessions/${session.session_id}/takeover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId }),
      });
    } finally {
      setTakingOver(false);
    }
  };

  const copyId = () => {
    navigator.clipboard.writeText(session.session_id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const transcriptLines = (session.transcript ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // ---- Sections ----

  const sessionIdSection = (
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
  );

  const statusSection = (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
        Status
      </span>
      <div className="flex flex-wrap gap-1.5">
        <PhaseBadge phase={session.phase} />
        {live && (
          <div className="flex items-center gap-1.5">
            {session.caller_speaking && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                Caller
              </span>
            )}
            {session.ai_speaking && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Agent
              </span>
            )}
            {session.human_speaking && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                Human
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );

  const callerSignalsSection = (
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
  );

  const querySection = session.query_type ? (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
        Query
      </span>
      <QueryTypeBadge session={session} />
    </div>
  ) : null;

  const timelineSection = (
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
                {new Date(session.started_at).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </div>
          )}
          {session.ended_at && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Ended</span>
              <span className="font-mono text-slate-600 dark:text-slate-300">
                {new Date(session.ended_at).toLocaleTimeString(undefined, {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );

  const transcriptSection = (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
        Transcript
      </span>
      {transcriptLines.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">No transcript yet</p>
      ) : (
        <div className={`flex flex-col gap-1.5 overflow-y-auto ${twoCol ? "" : "max-h-80"}`}>
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
  );

  const intelligenceSection =
    session.summary ||
    session.intent ||
    session.key_details ||
    session.agent_confidence ||
    session.user_confidence ? (
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
        {(session.agent_confidence || session.user_confidence) && (
          <div className="flex flex-wrap gap-1.5">
            {session.agent_confidence && (
              <ConfidenceBadge label="AI" level={session.agent_confidence} />
            )}
            {session.user_confidence && (
              <ConfidenceBadge label="User" level={session.user_confidence} />
            )}
          </div>
        )}
      </div>
    ) : null;

  const takeoverSection = live ? (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
        Takeover
      </span>

      {!session.human_takeover && (
        <button
          onClick={handleTakeover}
          disabled={takingOver || !agentId}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {takingOver && <SpinnerIcon className="w-4 h-4 animate-spin" />}
          Takeover
        </button>
      )}

      {isOthersClaim && session.claimed_by && (
        <ClaimedByBadge claimedBy={session.claimed_by} />
      )}

      {isMyClaim && (
        <div className="flex flex-col gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
            <span
              className={`w-1.5 h-1.5 rounded-full ${audioConnected ? "bg-indigo-500 animate-pulse" : "bg-slate-400"}`}
            />
            {audioConnected ? "You have the call" : "Connecting mic…"}
          </span>

          {audioError && (
            <p className="text-xs text-red-500 dark:text-red-400">{audioError}</p>
          )}

          {audioConnected && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => audioToggleMute()}
                aria-label={audioMuted ? "Unmute" : "Mute"}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all active:scale-95 ${
                  audioMuted
                    ? "bg-slate-700 hover:bg-slate-800 text-white"
                    : "bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-700 dark:text-white"
                }`}
              >
                {audioMuted
                  ? <MutedIcon className="w-4 h-4 fill-current shrink-0" />
                  : <MicIcon className="w-4 h-4 fill-current shrink-0" />
                }
                {audioMuted ? "Unmute" : "Mute"}
              </button>
              <TakeoverSpeakerBadge speaker={audioSpeaker} />
            </div>
          )}
        </div>
      )}
    </div>
  ) : null;

  const recordingSection =
    !live && (session.audio_mixed_url || session.audio_url) ? (
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
    ) : null;

  const lastUpdatedSection =
    live && session.timestamp ? (
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
    ) : null;

  return (
    <div className="p-4 flex flex-col gap-4 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
          Session Detail
        </h2>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          aria-label="Close panel"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Main content — 1 or 2 column layout */}
      {twoCol ? (
        <div className="grid grid-cols-2 gap-4 items-start">
          <div className="flex flex-col gap-4">
            {sessionIdSection}
            {statusSection}
            {transcriptSection}
          </div>
          <div className="flex flex-col gap-4">
            {takeoverSection}
            {callerSignalsSection}
            {querySection}
            {timelineSection}
            {intelligenceSection}
            {recordingSection}
            {lastUpdatedSection}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {takeoverSection}
          {sessionIdSection}
          {statusSection}
          {querySection}
          {callerSignalsSection}
          {timelineSection}
          {transcriptSection}
          {intelligenceSection}
          {recordingSection}
          {lastUpdatedSection}
        </div>
      )}
    </div>
  );
}
