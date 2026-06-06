"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";

import { WS_BASE } from "@/lib/config";
import { PAGE_SIZE } from "@/lib/constants";
import { getApiToken } from "@/lib/apiClient";
import { getSessions, getTickets, claimTicket } from "@/lib/api";
import type { Session, SessionEvent, Ticket, WsStatus } from "@/lib/types";
import { useUser } from "@/contexts/UserContext";
import { TabButton } from "@/components/admin/TabButton";
import { SessionCard } from "@/components/admin/SessionCard";
import { DetailPanel } from "@/components/admin/DetailPanel";
import { TicketCard } from "@/components/admin/TicketCard";
import { TicketPanel } from "@/components/admin/TicketPanel";
import { WsStatusBadge } from "@/components/admin/badges";
import { SpinnerIcon } from "@/components/ui/icons";

type Tab = "live" | "in_review" | "in_progress" | "resolved" | "closed";

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("live");

  const { profile } = useUser();
  const agentId = profile?.email ?? "";

  // Live tab
  const [sessions, setSessions] = useState<Record<string, Session>>({});
  const [wsStatus, setWsStatus] = useState<WsStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Ticket tabs — shared selected ticket
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  // In Review tab
  const [inReviewTickets, setInReviewTickets] = useState<Ticket[]>([]);
  const [inReviewHasMore, setInReviewHasMore] = useState(false);
  const [inReviewLoading, setInReviewLoading] = useState(false);
  const [inReviewFetched, setInReviewFetched] = useState(false);
  const inReviewOffsetRef = useRef(0);
  const inReviewFetchedRef = useRef(false);

  // In Progress tab
  const [inProgressTickets, setInProgressTickets] = useState<Ticket[]>([]);
  const [inProgressHasMore, setInProgressHasMore] = useState(false);
  const [inProgressLoading, setInProgressLoading] = useState(false);
  const [inProgressFetched, setInProgressFetched] = useState(false);
  const inProgressOffsetRef = useRef(0);
  const inProgressFetchedRef = useRef(false);

  // Resolved tab
  const [resolvedTickets, setResolvedTickets] = useState<Ticket[]>([]);
  const [resolvedHasMore, setResolvedHasMore] = useState(false);
  const [resolvedLoading, setResolvedLoading] = useState(false);
  const [resolvedFetched, setResolvedFetched] = useState(false);
  const resolvedOffsetRef = useRef(0);
  const resolvedFetchedRef = useRef(false);

  // Closed tab
  const [closedTickets, setClosedTickets] = useState<Ticket[]>([]);
  const [closedHasMore, setClosedHasMore] = useState(false);
  const [closedLoading, setClosedLoading] = useState(false);
  const [closedFetched, setClosedFetched] = useState(false);
  const closedOffsetRef = useRef(0);
  const closedFetchedRef = useRef(false);

  // Shared panel
  const [panelWidth, setPanelWidth] = useState(480);
  const isDraggingRef = useRef(false);

  // --- Live WebSocket ---
  const connect = useCallback(() => {
    wsRef.current?.close();
    const token = getApiToken() ?? "";
    const ws = new WebSocket(
      `${WS_BASE}/sessions/stream?token=${encodeURIComponent(token)}`,
    );
    wsRef.current = ws;

    ws.onopen = () => setWsStatus("connected");
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string) as { type?: string } & SessionEvent;
        if (msg.type === "ping") return;
        const event = msg;
        if (event.event_type === "session_ended") {
          setSessions((prev) => {
            const next = { ...prev };
            delete next[event.session_id];
            return next;
          });
          setSelectedSessionId((sel) => (sel === event.session_id ? null : sel));
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
    getSessions()
      .then((data) => {
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

  // --- Ticket fetching helpers ---

  const fetchInReview = useCallback(async () => {
    setInReviewLoading(true);
    try {
      const data = await getTickets({ status: "in_review", limit: PAGE_SIZE, offset: 0 });
      setInReviewTickets(data);
      inReviewOffsetRef.current = data.length;
      setInReviewHasMore(data.length === PAGE_SIZE);
      setInReviewFetched(true);
    } catch {
      setInReviewFetched(true);
    } finally {
      setInReviewLoading(false);
    }
  }, []);

  const loadMoreInReview = useCallback(async () => {
    setInReviewLoading(true);
    try {
      const data = await getTickets({
        status: "in_review",
        limit: PAGE_SIZE,
        offset: inReviewOffsetRef.current,
      });
      setInReviewTickets((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...data.filter((t) => !seen.has(t.id))];
      });
      inReviewOffsetRef.current += data.length;
      setInReviewHasMore(data.length === PAGE_SIZE);
    } catch {
      // silently fail
    } finally {
      setInReviewLoading(false);
    }
  }, []);

  const fetchInProgress = useCallback(async () => {
    setInProgressLoading(true);
    try {
      const data = await getTickets({ status: "in_progress", limit: PAGE_SIZE, offset: 0 });
      setInProgressTickets(data);
      inProgressOffsetRef.current = data.length;
      setInProgressHasMore(data.length === PAGE_SIZE);
      setInProgressFetched(true);
    } catch {
      setInProgressFetched(true);
    } finally {
      setInProgressLoading(false);
    }
  }, []);

  const loadMoreInProgress = useCallback(async () => {
    setInProgressLoading(true);
    try {
      const data = await getTickets({
        status: "in_progress",
        limit: PAGE_SIZE,
        offset: inProgressOffsetRef.current,
      });
      setInProgressTickets((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...data.filter((t) => !seen.has(t.id))];
      });
      inProgressOffsetRef.current += data.length;
      setInProgressHasMore(data.length === PAGE_SIZE);
    } catch {
      // silently fail
    } finally {
      setInProgressLoading(false);
    }
  }, []);

  const fetchResolved = useCallback(async () => {
    setResolvedLoading(true);
    try {
      const data = await getTickets({ status: "resolved", limit: PAGE_SIZE, offset: 0 });
      setResolvedTickets(data);
      resolvedOffsetRef.current = data.length;
      setResolvedHasMore(data.length === PAGE_SIZE);
      setResolvedFetched(true);
    } catch {
      setResolvedFetched(true);
    } finally {
      setResolvedLoading(false);
    }
  }, []);

  const loadMoreResolved = useCallback(async () => {
    setResolvedLoading(true);
    try {
      const data = await getTickets({
        status: "resolved",
        limit: PAGE_SIZE,
        offset: resolvedOffsetRef.current,
      });
      setResolvedTickets((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...data.filter((t) => !seen.has(t.id))];
      });
      resolvedOffsetRef.current += data.length;
      setResolvedHasMore(data.length === PAGE_SIZE);
    } catch {
      // silently fail
    } finally {
      setResolvedLoading(false);
    }
  }, []);

  const fetchClosed = useCallback(async () => {
    setClosedLoading(true);
    try {
      const data = await getTickets({ status: "closed", limit: PAGE_SIZE, offset: 0 });
      setClosedTickets(data);
      closedOffsetRef.current = data.length;
      setClosedHasMore(data.length === PAGE_SIZE);
      setClosedFetched(true);
    } catch {
      setClosedFetched(true);
    } finally {
      setClosedLoading(false);
    }
  }, []);

  const loadMoreClosed = useCallback(async () => {
    setClosedLoading(true);
    try {
      const data = await getTickets({
        status: "closed",
        limit: PAGE_SIZE,
        offset: closedOffsetRef.current,
      });
      setClosedTickets((prev) => {
        const seen = new Set(prev.map((t) => t.id));
        return [...prev, ...data.filter((t) => !seen.has(t.id))];
      });
      closedOffsetRef.current += data.length;
      setClosedHasMore(data.length === PAGE_SIZE);
    } catch {
      // silently fail
    } finally {
      setClosedLoading(false);
    }
  }, []);

  // Lazy fetch on first tab focus
  useEffect(() => {
    if (tab === "in_review" && !inReviewFetchedRef.current) {
      inReviewFetchedRef.current = true;
      fetchInReview();
    }
    if (tab === "in_progress" && !inProgressFetchedRef.current) {
      inProgressFetchedRef.current = true;
      fetchInProgress();
    }
    if (tab === "resolved" && !resolvedFetchedRef.current) {
      resolvedFetchedRef.current = true;
      fetchResolved();
    }
    if (tab === "closed" && !closedFetchedRef.current) {
      closedFetchedRef.current = true;
      fetchClosed();
    }
  }, [tab, fetchInReview, fetchInProgress, fetchResolved, fetchClosed]);

  const switchTab = (t: Tab) => {
    setTab(t);
    setSelectedSessionId(null);
    setSelectedTicket(null);
  };

  // Update a ticket in whichever list it belongs to
  const handleTicketUpdate = useCallback((updated: Ticket) => {
    const update = (list: Ticket[]) =>
      list.map((t) => (t.id === updated.id ? updated : t));
    setInReviewTickets(update);
    setInProgressTickets(update);
    setResolvedTickets(update);
    setClosedTickets(update);
    setSelectedTicket(updated);
  }, []);

  const sessionList = Object.values(sessions);
  const selectedSession =
    selectedSessionId != null ? sessions[selectedSessionId] : undefined;

  const currentTickets =
    tab === "in_review"
      ? inReviewTickets
      : tab === "in_progress"
        ? inProgressTickets
        : tab === "resolved"
          ? resolvedTickets
          : closedTickets;

  const currentHasMore =
    tab === "in_review"
      ? inReviewHasMore
      : tab === "in_progress"
        ? inProgressHasMore
        : tab === "resolved"
          ? resolvedHasMore
          : closedHasMore;

  const currentLoading =
    tab === "in_review"
      ? inReviewLoading
      : tab === "in_progress"
        ? inProgressLoading
        : tab === "resolved"
          ? resolvedLoading
          : closedLoading;

  const currentFetched =
    tab === "in_review"
      ? inReviewFetched
      : tab === "in_progress"
        ? inProgressFetched
        : tab === "resolved"
          ? resolvedFetched
          : closedFetched;

  const loadMore =
    tab === "in_review"
      ? loadMoreInReview
      : tab === "in_progress"
        ? loadMoreInProgress
        : tab === "resolved"
          ? loadMoreResolved
          : loadMoreClosed;

  const isLive = tab === "live";
  const showPanel = isLive ? !!selectedSession : !!selectedTicket;

  return (
    <>
      <div className="h-screen flex flex-col bg-linear-to-br from-green-50 to-emerald-100 dark:from-slate-900 dark:to-slate-800">
        {/* Header */}
        <header className="shrink-0 flex items-center justify-between px-5 py-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">
              Admin Dashboard
            </h1>
            {isLive && (
              <WsStatusBadge
                status={wsStatus}
                onReconnect={() => {
                  setWsStatus("connecting");
                  connect();
                }}
              />
            )}
          </div>
          <div className="flex items-center gap-3">
            {profile?.name && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {profile.name}
              </span>
            )}
            {isLive && (
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
            Live
            {sessionList.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 text-xs font-bold leading-none">
                {sessionList.length}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === "in_review"} onClick={() => switchTab("in_review")}>
            In Review
            {inReviewFetched && inReviewTickets.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-xs font-bold leading-none">
                {inReviewTickets.length}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === "in_progress"} onClick={() => switchTab("in_progress")}>
            In Progress
            {inProgressFetched && inProgressTickets.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold leading-none">
                {inProgressTickets.length}
              </span>
            )}
          </TabButton>
          <TabButton active={tab === "resolved"} onClick={() => switchTab("resolved")}>
            Resolved
          </TabButton>
          <TabButton active={tab === "closed"} onClick={() => switchTab("closed")}>
            Closed
          </TabButton>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main area */}
          <div className="flex-1 overflow-y-auto">
            {isLive ? (
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
                        selected={selectedSessionId === s.session_id}
                        onClick={() =>
                          setSelectedSessionId((prev) =>
                            prev === s.session_id ? null : s.session_id,
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 flex flex-col gap-4">
                {currentLoading && currentTickets.length === 0 ? (
                  <div className="flex items-center justify-center py-32 gap-2 text-slate-400 dark:text-slate-500">
                    <SpinnerIcon className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Loading…</span>
                  </div>
                ) : currentFetched && currentTickets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-32 text-slate-400 dark:text-slate-500 gap-2">
                    <p className="text-base font-medium">No tickets</p>
                    <p className="text-sm">Nothing here yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {currentTickets.map((t) => (
                      <TicketCard
                        key={t.id}
                        ticket={t}
                        selected={selectedTicket?.id === t.id}
                        onClick={() =>
                          setSelectedTicket((prev) =>
                            prev?.id === t.id ? null : t,
                          )
                        }
                        onClaim={
                          t.status === "in_review"
                            ? async () => {
                                try {
                                  const updated = await claimTicket(t.id);
                                  handleTicketUpdate(updated);
                                } catch {
                                  // silently fail — panel will show the error state
                                }
                              }
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}

                {(currentHasMore || (currentLoading && currentTickets.length > 0)) && (
                  <div className="flex justify-center">
                    <button
                      onClick={loadMore}
                      disabled={currentLoading}
                      className="px-5 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
                    >
                      {currentLoading && <SpinnerIcon className="w-4 h-4 animate-spin" />}
                      {currentLoading ? "Loading…" : "Load More"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Detail panel */}
          {showPanel && (
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
              {isLive && selectedSession ? (
                <DetailPanel
                  session={selectedSession}
                  live
                  agentId={agentId}
                  panelWidth={panelWidth}
                  onClose={() => setSelectedSessionId(null)}
                />
              ) : selectedTicket ? (
                <TicketPanel
                  ticket={selectedTicket}
                  onClose={() => setSelectedTicket(null)}
                  onUpdate={handleTicketUpdate}
                />
              ) : null}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
