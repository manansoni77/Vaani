"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";

import { API_BASE, WS_BASE } from "@/lib/config";
import { PAGE_SIZE } from "@/lib/constants";
import type { Session, SessionEvent, WsStatus } from "@/lib/types";
import { AgentIdModal } from "@/components/admin/AgentIdModal";
import { TabButton } from "@/components/admin/TabButton";
import { SessionCard } from "@/components/admin/SessionCard";
import { DetailPanel } from "@/components/admin/DetailPanel";
import { WsStatusBadge } from "@/components/admin/badges";
import { SpinnerIcon } from "@/components/ui/icons";

type Tab = "live" | "history";

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
    return () => { wsRef.current?.close(); };
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
      const qt = queryTypeOverride !== undefined ? queryTypeOverride : historyQueryType;
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
        return [...prev, ...data.filter((s) => s.id == null || !seen.has(s.id))];
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

  // History query type filter tabs config
  const queryTypeFilters = [
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
  ] as const;

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
              className={`w-2 h-2 rounded-full ${
                wsStatus === "connected" ? "bg-green-500" : "bg-slate-300 dark:bg-slate-600"
              }`}
            />
            Live Calls
            {sessionList.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 text-xs font-bold leading-none">
                {sessionList.length}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === "history"} onClick={() => switchTab("history")}>
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
                    <p className="text-sm">Sessions will appear here as calls connect</p>
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
                    {queryTypeFilters.map(({ value, label, active, inactive }) => (
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
                        className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          historyQueryType === value ? active : inactive
                        }`}
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
                      onChange={(e) => setOrder(e.target.value as "newest" | "oldest")}
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
                        <SpinnerIcon className="w-4 h-4 animate-spin" />
                        Loading...
                      </span>
                    )}
                  </div>
                </div>

                {/* History cards */}
                <div className="p-4">
                  {historyFetched && history.length === 0 && !historyLoading ? (
                    <div className="flex flex-col items-center justify-center py-32 text-slate-400 dark:text-slate-500 gap-2">
                      <p className="text-base font-medium">No completed calls</p>
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
                    setPanelWidth(Math.min(900, Math.max(280, startWidth + delta)));
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
