"use client";

import type { Ticket } from "@/lib/types";
import { TicketStatusBadge } from "@/components/admin/badges";
import { useDepartments } from "@/contexts/DepartmentContext";

interface Props {
  ticket: Ticket;
  selected: boolean;
  onClick: () => void;
  onClaim?: () => void;
}

const PRIORITY_CLS: Record<string, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  low: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

export function TicketCard({ ticket, selected, onClick, onClaim }: Props) {
  const { departments } = useDepartments();
  const deptName = departments.find((d) => d.id === ticket.routed_department_id)?.name ?? null;
  const lastComment = ticket.comments.length > 0 ? ticket.comments[ticket.comments.length - 1] : null;

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={`w-full text-left rounded-xl border p-4 flex flex-col gap-2.5 transition-all hover:shadow-md cursor-pointer ${
        selected
          ? "border-green-500 bg-green-50 dark:bg-green-950/30 shadow-md ring-1 ring-green-500/30"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600"
      }`}
    >
      {/* Row 1: ID + status */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-400">
          #{ticket.id}
        </span>
        <div className="flex items-center gap-1.5">
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${PRIORITY_CLS[ticket.priority] ?? PRIORITY_CLS.low}`}>
            {ticket.priority}
          </span>
          <TicketStatusBadge status={ticket.status} />
        </div>
      </div>

      {/* Row 2: Department + assigned */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <span className={`text-xs ${deptName ? "text-slate-700 dark:text-slate-300 font-medium" : "text-slate-400 dark:text-slate-500 italic"}`}>
          {deptName ?? "Unrouted"}
        </span>
        {ticket.assigned_to && (
          <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
            → {ticket.assigned_to}
          </span>
        )}
      </div>

      {/* Row 3: Caller */}
      <div className="text-xs text-slate-400 dark:text-slate-500 font-mono">
        Caller #{ticket.caller_id}
      </div>

      {/* Row 4: Description */}
      {ticket.description ? (
        <p className="text-xs text-slate-600 dark:text-slate-300 truncate leading-relaxed">
          {ticket.description}
        </p>
      ) : (
        <p className="text-xs text-slate-400 dark:text-slate-500 italic">No description</p>
      )}

      {/* Row 4: Last comment */}
      {lastComment && (
        <p className="text-xs text-slate-500 dark:text-slate-400 italic truncate border-l-2 border-slate-200 dark:border-slate-600 pl-2">
          {lastComment.msg}
        </p>
      )}

      {/* Footer: dates + claim */}
      <div className="flex items-end justify-between gap-2 mt-auto pt-1 border-t border-slate-100 dark:border-slate-700">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
            Created {new Date(ticket.created_at).toLocaleDateString()}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
            Updated {new Date(ticket.updated_at).toLocaleDateString()}
          </span>
        </div>
        {onClaim && (
          <button
            onClick={(e) => { e.stopPropagation(); onClaim(); }}
            className="shrink-0 text-xs px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            Claim
          </button>
        )}
      </div>
    </div>
  );
}
