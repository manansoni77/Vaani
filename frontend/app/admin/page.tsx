"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";

import { API_BASE, WS_BASE } from "@/lib/config";
import { useAudioStream } from "@/lib/hooks/useAudioStream";
import type { SpeakerState } from "@/lib/hooks/useAudioStream";

type Tab = "live" | "history";
type Phase = "GREETING" | "CAPTURE" | "VALIDATION" | "DECISION" | "COMPLETE";
type Sentiment = "neutral" | "calm" | "anxious" | "angry";
type Urgency = "none" | "low" | "medium" | "high";
type WsStatus = "connecting" | "connected" | "disconnected" | "error";

const PAGE_SIZE = 20;

interface Session {
  id?: number;
  session_id: string;
  phase: Phase;
  duration_s: number;
  turns: number;
  sentiment: Sentiment;
  urgency_level: Urgency;
  human_requested: boolean;
  human_takeover?: boolean;
  claimed_by?: string | null;
  transcript?: string;
  started_at?: string;
  ended_at?: string;
  audio_url?: string | null;
  audio_mixed_url?: string | null;
  summary?: string;
  intent?: string;
  key_details?: string;
  agent_confidence?: "GREEN" | "YELLOW" | "RED";
  user_confidence?: "GREEN" | "YELLOW" | "RED";
  query_type?: "EMERGENCY" | "MUNICIPALITY" | "GENERAL" | null;
  service_type?: "police" | "medical" | "fire" | "disaster_relief" | null;
  location?: string | null;
  since_when?: string | null;
  // Live-only
  caller_speaking?: boolean;
  ai_speaking?: boolean;
  human_speaking?: boolean;
  timestamp?: string;
}

interface SessionEvent extends Session {
  event_type: "session_started" | "session_updated" | "session_ended";
}

function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function transcriptPreview(transcript?: string): string {
  if (!transcript) return "";
  const lines = transcript.split("\n").filter(Boolean);
  const last = lines[lines.length - 1] ?? "";
  return last.replace(/^(user|agent|human):\s*/i, "");
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("live");

  // Agent identity
  const [agentId, setAgentId] = useState("");
  const [showAgentModal, setShowAgentModal] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("vaani_agent_id");
    setTimeout(() => {
      if (stored) setAgentId(stored);
      else setShowAgentModal(true);
    }, 0);
  }, []);

  const saveAgentId = (id: string) => {
    localStorage.setItem("vaani_agent_id", id);
    setAgentId(id);
    setShowAgentModal(false);
  };

  // Live tab
  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);

  // History tab
  const [history, setHistory] = useState<Session[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFetched, setHistoryFetched] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [order, setOrder] = useState<"newest" | "oldest">("newest");
  const [historyQueryType, setHistoryQueryType] = useState("");
  const historyOffsetRef = useRef(0);
  const hasFetchedRef = useRef(false);

  // Shared
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(480);
  const isDraggingRef = useRef(false);

  // --- Live WebSocket ---
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
          setSelectedId((sel) => (sel === event.session_id ? null : sel));
        } else {
          setSessions((prev) => ({ ...prev, [event.session_id]: event }));
        }
      } catch {
        // ignore malformed frames
      }
    };
    ws.onerror = () => setWsStatus("error");
    ws.onclose = () =>
      setWsStatus((s) => (s === "connecting" ? "error" : "disconnected"));
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/sessions`)
      .then((r) => r.json())
      .then((data: Session[]) => {
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

  // --- History fetching ---
  const buildHistoryQuery = useCallback(
    (offset: number, queryTypeOverride?: string) => {
      const p = new URLSearchParams();
      if (startDate) p.set("start_date", new Date(startDate).toISOString());
      if (endDate) p.set("end_date", new Date(endDate).toISOString());
      p.set("order", order);
      p.set("limit", String(PAGE_SIZE));
      p.set("offset", String(offset));
      const qt =
        queryTypeOverride !== undefined ? queryTypeOverride : historyQueryType;
      if (qt) p.set("query_type", qt);
      return p.toString();
    },
    [startDate, endDate, order, historyQueryType],
  );

  const fetchHistory = useCallback(
    async (queryTypeOverride?: string) => {
      setHistoryLoading(true);
      try {
        const res = await fetch(
          `${API_BASE}/sessions/history?${buildHistoryQuery(0, queryTypeOverride)}`,
        );
        if (!res.ok) throw new Error();
        const data: Session[] = await res.json();
        setHistory(data);
        historyOffsetRef.current = data.length;
        setHistoryHasMore(data.length === PAGE_SIZE);
        setHistoryFetched(true);
      } catch {
        setHistoryFetched(true);
      } finally {
        setHistoryLoading(false);
      }
    },
    [buildHistoryQuery],
  );

  const loadMoreHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/sessions/history?${buildHistoryQuery(historyOffsetRef.current)}`,
      );
      if (!res.ok) throw new Error();
      const data: Session[] = await res.json();
      setHistory((prev) => {
        const seen = new Set(prev.map((s) => s.id));
        return [
          ...prev,
          ...data.filter((s) => s.id == null || !seen.has(s.id)),
        ];
      });
      historyOffsetRef.current += data.length;
      setHistoryHasMore(data.length === PAGE_SIZE);
    } catch {
      // silently fail
    } finally {
      setHistoryLoading(false);
    }
  }, [buildHistoryQuery]);

  useEffect(() => {
    if (tab !== "history" || hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    const id = setTimeout(() => fetchHistory(), 0);
    return () => clearTimeout(id);
  }, [tab, fetchHistory]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setSelectedId(null);
  };

  const sessionList = Object.values(sessions);
  const selectedSession =
    selectedId != null
      ? tab === "live"
        ? sessions[selectedId]
        : history.find((h) => h.session_id === selectedId)
      : undefined;

  return (
    <>
      {showAgentModal && <AgentIdModal onSave={saveAgentId} />}

      <div className="h-screen flex flex-col bg-linear-to-br from-green-50 to-emerald-100 dark:from-slate-900 dark:to-slate-800">
        {/* Header */}
        <header className="shrink-0 flex items-center justify-between px-5 py-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">
              Admin Dashboard
            </h1>
            <WsStatusBadge
              status={wsStatus}
              onReconnect={() => {
                setWsStatus("connecting");
                connect();
              }}
            />
          </div>
          <div className="flex items-center gap-3">
            {agentId && (
              <button
                onClick={() => setShowAgentModal(true)}
                className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
              >
                {agentId}
              </button>
            )}
            {tab === "live" && (
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {sessionList.length} active{" "}
                {sessionList.length === 1 ? "call" : "calls"}
              </span>
            )}
            <Link
              href="/"
              className="px-3 py-1.5 bg-slate-600 hover:bg-slate-700 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              ← Back
            </Link>
          </div>
        </header>

        {/* Tabs */}
        <div className="shrink-0 flex items-center gap-1 px-4 pt-3 bg-white/60 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700">
          <TabButton active={tab === "live"} onClick={() => switchTab("live")}>
            <span
              className={`w-2 h-2 rounded-full ${wsStatus === "connected" ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"}`}
            />
            Live Calls
            {sessionList.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 text-xs font-bold leading-none">
                {sessionList.length}
              </span>
            )}
          </TabButton>
          <TabButton
            active={tab === "history"}
            onClick={() => switchTab("history")}
          >
            Completed Calls
          </TabButton>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main area */}
          <div className="flex-1 overflow-y-auto">
            {tab === "live" ? (
              <div className="p-4">
                {sessionList.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-32 text-slate-400 dark:text-slate-500 gap-2">
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
                        live
                        selected={selectedId === s.session_id}
                        onClick={() =>
                          setSelectedId((prev) =>
                            prev === s.session_id ? null : s.session_id,
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col">
                {/* History filter bar */}
                <div className="sticky top-0 z-10 flex flex-col gap-2 px-4 py-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
                  {/* Query type sub-tabs */}
                  <div className="flex items-center gap-1">
                    {(
                      [
                        {
                          value: "",
                          label: "All",
                          active: "bg-slate-700 text-white",
                          inactive:
                            "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700",
                        },
                        {
                          value: "EMERGENCY",
                          label: "Emergency",
                          active: "bg-red-600 text-white",
                          inactive:
                            "bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50",
                        },
                        {
                          value: "MUNICIPALITY",
                          label: "Municipality",
                          active: "bg-amber-500 text-white",
                          inactive:
                            "bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50",
                        },
                        {
                          value: "GENERAL",
                          label: "General",
                          active: "bg-blue-600 text-white",
                          inactive:
                            "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50",
                        },
                      ] as const
                    ).map(({ value, label, active, inactive }) => (
                      <button
                        key={value}
                        disabled={historyLoading}
                        onClick={() => {
                          if (historyQueryType === value) return;
                          setHistoryQueryType(value);
                          setHistory([]);
                          historyOffsetRef.current = 0;
                          fetchHistory(value);
                        }}
                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${historyQueryType === value ? active : inactive}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {/* Date / order filters */}
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="datetime-local"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      disabled={historyLoading}
                      className="px-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                    <input
                      type="datetime-local"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      disabled={historyLoading}
                      className="px-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-400"
                    />
                    <select
                      value={order}
                      onChange={(e) =>
                        setOrder(e.target.value as "newest" | "oldest")
                      }
                      disabled={historyLoading}
                      className="px-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-green-400"
                    >
                      <option value="newest">Newest first</option>
                      <option value="oldest">Oldest first</option>
                    </select>
                    <button
                      onClick={() => fetchHistory()}
                      disabled={historyLoading}
                      className="px-4 py-1.5 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                      Search
                    </button>
                    {historyHasMore && (
                      <button
                        onClick={loadMoreHistory}
                        disabled={historyLoading}
                        className="px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                      >
                        Load More
                      </button>
                    )}
                    {historyLoading && (
                      <span className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                        <svg
                          className="w-4 h-4 animate-spin"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2.5}
                        >
                          <circle cx={12} cy={12} r={10} strokeOpacity={0.25} />
                          <path d="M12 2a10 10 0 0 1 10 10" />
                        </svg>
                        Loading...
                      </span>
                    )}
                  </div>
                </div>

                {/* History cards */}
                <div className="p-4">
                  {historyFetched && history.length === 0 && !historyLoading ? (
                    <div className="flex flex-col items-center justify-center py-32 text-slate-400 dark:text-slate-500 gap-2">
                      <p className="text-base font-medium">
                        No completed calls
                      </p>
                      <p className="text-sm">Try adjusting your date filters</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {history.map((s) => (
                        <SessionCard
                          key={s.id ?? s.session_id}
                          session={s}
                          live={false}
                          selected={selectedId === s.session_id}
                          onClick={() =>
                            setSelectedId((prev) =>
                              prev === s.session_id ? null : s.session_id,
                            )
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Detail panel */}
          {selectedSession && (
            <div
              className="shrink-0 relative border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-y-auto"
              style={{ width: panelWidth }}
            >
              {/* Drag handle */}
              <div
                className="absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-green-400/50 active:bg-green-400 transition-colors z-10"
                onMouseDown={(e) => {
                  e.preventDefault();
                  isDraggingRef.current = true;
                  const startX = e.clientX;
                  const startWidth = panelWidth;
                  const onMove = (ev: MouseEvent) => {
                    if (!isDraggingRef.current) return;
                    const delta = startX - ev.clientX;
                    setPanelWidth(
                      Math.min(900, Math.max(280, startWidth + delta)),
                    );
                  };
                  const onUp = () => {
                    isDraggingRef.current = false;
                    window.removeEventListener("mousemove", onMove);
                    window.removeEventListener("mouseup", onUp);
                  };
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                }}
              />
              <DetailPanel
                session={selectedSession}
                live={tab === "live"}
                agentId={agentId}
                panelWidth={panelWidth}
                onClose={() => setSelectedId(null)}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// --- Agent ID modal ---

function AgentIdModal({ onSave }: { onSave: (id: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 flex flex-col gap-4 w-80 shadow-xl">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Identify yourself
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Your agent name is shown when you claim sessions.
          </p>
        </div>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && value.trim() && onSave(value.trim())
          }
          placeholder="Agent name"
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        <button
          onClick={() => value.trim() && onSave(value.trim())}
          disabled={!value.trim()}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// --- Tab button ---

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
        active
          ? "border-green-500 text-green-700 dark:text-green-400 bg-white/80 dark:bg-slate-800/80"
          : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

// --- Session card ---

function SessionCard({
  session,
  live,
  selected,
  onClick,
}: {
  session: Session;
  live: boolean;
  selected: boolean;
  onClick: () => void;
}) {
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
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-slate-400 dark:text-slate-500 truncate">
          {session.session_id.slice(0, 12)}…
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {live && session.caller_speaking && (
            <span className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              Caller
            </span>
          )}
          {live && session.ai_speaking && (
            <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Agent
            </span>
          )}
          {live && session.human_speaking && (
            <span className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-semibold">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
              Human
            </span>
          )}
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

      {session.query_type && <QueryTypeBadge session={session} compact />}

      {preview && (
        <p className="text-xs text-slate-500 dark:text-slate-400 italic line-clamp-2 leading-relaxed">
          &ldquo;{preview}&rdquo;
        </p>
      )}

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

// --- Detail panel ---

function DetailPanel({
  session,
  live,
  agentId,
  panelWidth,
  onClose,
}: {
  session: Session;
  live: boolean;
  agentId: string;
  panelWidth: number;
  onClose: () => void;
}) {
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
    // No onServerMessage — admin audio WS only sends binary TTS PCM frames.
  });

  const audioConnected = audioStatus === "active";

  const isMyClaim =
    live && !!session.human_takeover && session.claimed_by === agentId;
  const isOthersClaim =
    live && !!session.human_takeover && session.claimed_by !== agentId;

  // Connect audio when this agent claims the session; disconnect on unclaim or unmount.
  // audioError is only rendered inside the isMyClaim block so it is automatically
  // hidden when isMyClaim is false — no need to clear it here.
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
  );

  const statusSection = (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
        Status
      </span>
      <div className="flex flex-wrap gap-1.5">
        <PhaseBadge phase={session.phase} />
        {live && session.caller_speaking && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            Caller
          </span>
        )}
        {live && session.ai_speaking && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Agent
          </span>
        )}
        {live && session.human_speaking && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
            Human
          </span>
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
        <p className="text-xs text-slate-400 dark:text-slate-500">
          No transcript yet
        </p>
      ) : (
        <div
          className={`flex flex-col gap-1.5 overflow-y-auto ${twoCol ? "" : "max-h-80"}`}
        >
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

            const label = isAgent
              ? "Agent"
              : isHuman
                ? "Human"
                : isUser
                  ? "User"
                  : null;

            return (
              <div
                key={i}
                className={`text-xs px-3 py-2 rounded-lg leading-relaxed ${cls}`}
              >
                {label && (
                  <span className="font-semibold text-xs uppercase tracking-wide block mb-0.5 opacity-60">
                    {label}
                    {turnSentiment && (
                      <span
                        className={`normal-case font-normal ml-1 ${sentimentCls}`}
                      >
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
            <p className="text-xs text-slate-700 dark:text-slate-300">
              {session.intent}
            </p>
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
          {takingOver && (
            <svg
              className="w-4 h-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <circle cx={12} cy={12} r={10} strokeOpacity={0.25} />
              <path d="M12 2a10 10 0 0 1 10 10" />
            </svg>
          )}
          Takeover
        </button>
      )}

      {isOthersClaim && (
        <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium">
          <svg
            viewBox="0 0 16 16"
            className="w-3.5 h-3.5 fill-current shrink-0"
          >
            <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM12.735 14c.618 0 1.093-.561.872-1.139a6.002 6.002 0 0 0-11.215 0c-.22.578.254 1.139.872 1.139h9.47Z" />
          </svg>
          Claimed by <span className="font-semibold">{session.claimed_by}</span>
        </span>
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
            <p className="text-xs text-red-500 dark:text-red-400">
              {audioError}
            </p>
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
                {audioMuted ? <MutedIcon /> : <MicIcon />}
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
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current">
            <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
          </svg>
        </button>
      </div>

      {/* Main content — 1 or 2 col */}
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

function ConfidenceBadge({
  label,
  level,
}: {
  label: string;
  level: "GREEN" | "YELLOW" | "RED";
}) {
  const styles: Record<"GREEN" | "YELLOW" | "RED", string> = {
    GREEN:
      "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300",
    YELLOW:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    RED: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  };
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-semibold ${styles[level]}`}
    >
      {label} confidence: {level}
    </span>
  );
}

function QueryTypeBadge({
  session,
  compact,
}: {
  session: Session;
  compact?: boolean;
}) {
  const qtStyles: Record<string, { badge: string; label: string }> = {
    EMERGENCY: {
      badge: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
      label: "Emergency",
    },
    MUNICIPALITY: {
      badge:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
      label: "Municipality",
    },
    GENERAL: {
      badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
      label: "General",
    },
  };

  const stLabels: Record<string, string> = {
    police: "Police",
    medical: "Medical",
    fire: "Fire",
    disaster_relief: "Disaster Relief",
  };

  const qt = session.query_type;
  if (!qt) return null;

  const { badge, label } = qtStyles[qt] ?? {
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
    label: qt,
  };

  return (
    <div className={`flex flex-col gap-1 ${compact ? "" : ""}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge}`}
        >
          {label}
        </span>
        {qt === "EMERGENCY" && session.service_type && (
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800">
            {stLabels[session.service_type] ?? session.service_type}
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

// --- Takeover audio icons and speaker badge ---

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0">
      <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1.5 17.93A8.001 8.001 0 0 1 4 11H2a10 10 0 0 0 9 9.95V23h2v-2.05A10 10 0 0 0 22 11h-2a8 8 0 0 1-6.5 7.93V19h-3v-0.07z" />
    </svg>
  );
}

function MutedIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current shrink-0">
      <path d="M3.71 2.29a1 1 0 0 0-1.42 1.42l18 18a1 1 0 0 0 1.42-1.42l-18-18zM12 1a4 4 0 0 1 4 4v.18l-8 8V5a4 4 0 0 1 4-4zm4 12.46A4 4 0 0 1 8 11V9.46l8 8zM4 11H2a10 10 0 0 0 9 9.95V23h2v-2.05A10 10 0 0 0 22 11h-2a8 8 0 0 1-14.27 3.7L4 11z" />
    </svg>
  );
}

// Admin takeover labels: outgoing mic activity = "Human Agent" (you), incoming audio = "User" (the caller)
function TakeoverSpeakerBadge({ speaker }: { speaker: SpeakerState }) {
  useEffect(() => {
    console.log("Speaker state changed:", speaker);
  }, [speaker]);

  if (speaker === "silent") return null;
  const styles: Record<
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
  const { label, cls, dot } = styles[speaker];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${dot}`} />
      {label}
    </span>
  );
}
