"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";

import { API_BASE, WS_BASE } from "@/lib/config";
import { PAGE_SIZE, AUDIT_ENTITIES, AUDIT_LEVELS, AUDIT_INPUT_CLS, AUDIT_SELECT_CLS } from "@/lib/constants";
import type { LogEntry } from "@/lib/types";
import { SpinnerIcon } from "@/components/ui/icons";
import { LogRow } from "@/components/audit/LogRow";

export default function AuditPage() {
  const [entity, setEntity] = useState("");
  const [level, setLevel] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [order, setOrder] = useState<"newest" | "oldest">("newest");

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState(false);
  const [queried, setQueried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const offsetRef = useRef(0);

  const buildQuery = useCallback(
    (currentOffset: number) => {
      const p = new URLSearchParams();
      if (entity) p.set("entity", entity);
      if (level) p.set("level", level);
      if (sessionId.trim()) p.set("session_id", sessionId.trim());
      if (startDate) p.set("start_date", new Date(startDate).toISOString());
      if (endDate) p.set("end_date", new Date(endDate).toISOString());
      p.set("order", order);
      p.set("limit", String(PAGE_SIZE));
      p.set("offset", String(currentOffset));
      return p.toString();
    },
    [entity, level, sessionId, startDate, endDate, order],
  );

  const search = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/logs?${buildQuery(0)}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: LogEntry[] = await res.json();
      setLogs(data);
      offsetRef.current = data.length;
      setHasMore(data.length === PAGE_SIZE);
      setQueried(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  const loadMore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/logs?${buildQuery(offsetRef.current)}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: LogEntry[] = await res.json();
      setLogs((prev) => {
        const seen = new Set(prev.map((l) => l.id));
        return [...prev, ...data.filter((l) => l.id == null || !seen.has(l.id))];
      });
      offsetRef.current += data.length;
      setHasMore(data.length === PAGE_SIZE);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  const startLive = useCallback(() => {
    setLogs([]);
    setQueried(true);
    setHasMore(false);
    setError(null);
    setLive(true);

    const p = new URLSearchParams();
    if (entity) p.set("entity", entity);
    if (level) p.set("level", level);

    const ws = new WebSocket(`${WS_BASE}/logs/stream?${p}`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const entry: LogEntry = JSON.parse(e.data as string);
        setLogs((prev) => [entry, ...prev]);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onerror = () => setError("WebSocket error");
    ws.onclose = () => setLive(false);
  }, [entity, level]);

  const stopLive = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setLive(false);
  }, []);

  useEffect(() => {
    return () => { wsRef.current?.close(); };
  }, []);

  const disabled = loading || live;

  return (
    <div className="min-h-screen bg-linear-to-br from-purple-50 to-pink-100 dark:from-slate-900 dark:to-slate-800">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex flex-col gap-2.5">
        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            disabled={disabled}
            className={AUDIT_SELECT_CLS}
          >
            <option value="">All entities</option>
            {AUDIT_ENTITIES.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            disabled={disabled}
            className={AUDIT_SELECT_CLS}
          >
            <option value="">All levels</option>
            {AUDIT_LEVELS.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
          <input
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            disabled={disabled}
            placeholder="Session ID"
            className={`${AUDIT_INPUT_CLS} w-48`}
          />
          <input
            type="datetime-local"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={disabled}
            className={AUDIT_INPUT_CLS}
          />
          <input
            type="datetime-local"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={disabled}
            className={AUDIT_INPUT_CLS}
          />
          <select
            value={order}
            onChange={(e) => setOrder(e.target.value as "newest" | "oldest")}
            disabled={disabled}
            className={AUDIT_SELECT_CLS}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={search}
            disabled={disabled}
            className="px-4 py-1.5 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
          >
            Search
          </button>
          {live ? (
            <button
              onClick={stopLive}
              className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5"
            >
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              Stop Live
            </button>
          ) : (
            <button
              onClick={startLive}
              disabled={loading}
              className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Go Live
            </button>
          )}
          {hasMore && !live && (
            <button
              onClick={loadMore}
              disabled={loading}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Load More
            </button>
          )}
          {loading && (
            <span className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
              <SpinnerIcon className="w-4 h-4 animate-spin" />
              Loading...
            </span>
          )}
          {error && (
            <span className="text-sm text-red-500 dark:text-red-400">{error}</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 py-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Audit Logs
          </h1>
          <Link
            href="/"
            className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            ← Back
          </Link>
        </div>

        {!queried ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-400 dark:text-slate-500 gap-1.5">
            <p className="text-base font-medium">No data yet</p>
            <p className="text-sm">Search or Go Live to see logs</p>
          </div>
        ) : logs.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-400 dark:text-slate-500 gap-1.5">
            <p className="text-base font-medium">No logs found</p>
            <p className="text-sm">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {logs.map((log, i) => (
              <LogRow key={log.id ?? i} log={log} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
