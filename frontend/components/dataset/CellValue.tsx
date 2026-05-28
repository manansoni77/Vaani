"use client";

import { useState } from "react";
import type { DatasetSample } from "@/lib/types";

export function CellValue({ value }: { value: DatasetSample[string] }) {
  const [expanded, setExpanded] = useState(false);

  if (value === null || value === undefined) {
    return (
      <span className="text-slate-300 dark:text-slate-600 select-none">—</span>
    );
  }

  if (typeof value === "boolean") {
    return (
      <span
        className={`inline-block px-1.5 py-0.5 rounded font-semibold ${
          value
            ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
            : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
        }`}
      >
        {value ? "Yes" : "No"}
      </span>
    );
  }

  const str = String(value);
  const isLong = str.length > 120 || str.includes("\n");

  if (!isLong) {
    return (
      <span className="text-slate-700 dark:text-slate-300 wrap-break-word">
        {str}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span
        className={`text-slate-700 dark:text-slate-300 whitespace-pre-wrap wrap-break-word leading-relaxed ${
          expanded ? "" : "line-clamp-3"
        }`}
      >
        {str}
      </span>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-indigo-500 hover:text-indigo-700 dark:hover:text-indigo-300 text-xs font-medium self-start transition-colors"
      >
        {expanded ? "Show less" : "Show more"}
      </button>
    </div>
  );
}
