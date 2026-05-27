"use client";

import { useState } from "react";

interface Props {
  onSave: (id: string) => void;
}

export function AgentIdModal({ onSave }: Props) {
  const [value, setValue] = useState("");

  const submit = () => {
    if (value.trim()) onSave(value.trim());
  };

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
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Agent name"
          className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        <button
          onClick={submit}
          disabled={!value.trim()}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
