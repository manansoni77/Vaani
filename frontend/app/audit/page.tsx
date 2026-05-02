"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";
const WS_BASE =
  process.env.NEXT_PUBLIC_WS_URL?.replace(/\/$/, "") ?? "ws://localhost:8000";

const PAGE_SIZE = 20;

const ENTITIES = ["APP", "CALL", "SARVAM_STT", "SARVAM_TTS", "OPENAI_LLM"];
const LEVELS = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"];

interface LogEntry {
  id?: number;
  level: string;
  entity: string;
  session_id: string | null;
  timestamp: string;
  message: string;
}

const inputCls =
  "px-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-purple-400";

const selectCls =
  "px-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-purple-400";

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
    [entity, level, sessionId, startDate, endDate, order]
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
    return () => {
      wsRef.current?.close();
    };
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
            className={selectCls}
          >
            <option value="">All entities</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            disabled={disabled}
            className={selectCls}
          >
            <option value="">All levels</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <input
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            disabled={disabled}
            placeholder="Session ID"
            className={`${inputCls} w-48`}
          />
          <input
            type="datetime-local"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={disabled}
            className={inputCls}
          />
          <input
            type="datetime-local"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            disabled={disabled}
            className={inputCls}
          />
          <select
            value={order}
            onChange={(e) => setOrder(e.target.value as "newest" | "oldest")}
            disabled={disabled}
            className={selectCls}
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

function LogRow({ log }: { log: LogEntry }) {
  const [expanded, setExpanded] = useState(false);

  const ts = new Date(log.timestamp).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    fractionalSecondDigits: 3,
  });

  return (
    <div className="rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-sm font-mono overflow-hidden">
      <div className="flex items-start gap-2.5 px-3 py-2">
        <span className="text-slate-400 dark:text-slate-500 shrink-0 text-xs pt-0.5">
          {ts}
        </span>
        <LevelBadge level={log.level} />
        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0">
          {log.entity}
        </span>
        {log.session_id && <SessionId id={log.session_id} />}
        <span
          className={`text-slate-700 dark:text-slate-300 break-all leading-snug flex-1 ${
            expanded ? "" : "line-clamp-2"
          }`}
        >
          {log.message}
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 mt-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          title={expanded ? "Collapse" : "Expand"}
        >
          <svg
            viewBox="0 0 16 16"
            className={`w-3.5 h-3.5 fill-current transition-transform ${expanded ? "rotate-180" : ""}`}
          >
            <path d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function LevelBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    DEBUG:
      "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
    INFO: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
    WARNING:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    ERROR:
      "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
    CRITICAL:
      "bg-red-600 text-white dark:bg-red-700",
  };
  const cls =
    styles[level] ?? "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400";

  return (
    <span
      className={`text-xs font-bold px-2 py-0.5 rounded shrink-0 tracking-wide ${cls}`}
    >
      {level}
    </span>
  );
}

function SessionId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [id]);

  return (
    <span className="group relative flex items-center gap-1 shrink-0">
      <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
        {id.slice(0, 8)}
      </span>
      <button
        onClick={copy}
        title="Copy session ID"
        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
      >
        {copied ? (
          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-green-500">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="w-3 h-3 fill-current">
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z" />
            <path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
          </svg>
        )}
      </button>
    </span>
  );
}
