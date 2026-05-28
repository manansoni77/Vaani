"use client";

import { useState, useCallback } from "react";
import { CopyIcon, CheckIcon } from "@/components/ui/icons";

export function SessionId({ id }: { id: string }) {
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
        {copied
          ? <CheckIcon className="w-3 h-3 fill-green-500" />
          : <CopyIcon className="w-3 h-3 fill-current" />
        }
      </button>
    </span>
  );
}
