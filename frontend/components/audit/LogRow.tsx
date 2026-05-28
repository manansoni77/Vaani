"use client";

import { useState } from "react";

import type { LogEntry } from "@/lib/types";
import { ChevronDownIcon } from "@/components/ui/icons";
import { LevelBadge } from "@/components/audit/LevelBadge";
import { SessionId } from "@/components/audit/SessionId";

export function LogRow({ log }: { log: LogEntry }) {
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
          <ChevronDownIcon
            className={`w-3.5 h-3.5 fill-current transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>
    </div>
  );
}
