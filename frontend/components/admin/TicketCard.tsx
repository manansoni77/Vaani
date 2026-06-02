import type { Ticket } from "@/lib/types";
import { TicketStatusBadge } from "@/components/admin/badges";

interface Props {
  ticket: Ticket;
  selected: boolean;
  onClick: () => void;
  onClaim?: () => void;
}

export function TicketCard({ ticket, selected, onClick, onClaim }: Props) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 flex flex-col gap-3 transition-all hover:shadow-md ${
        selected
          ? "border-green-500 bg-green-50 dark:bg-green-950/30 shadow-md ring-1 ring-green-500/30"
          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600"
      }`}
    >
      {/* Top row: ticket ID + status badge */}
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
          #{ticket.id}
        </span>
        <TicketStatusBadge status={ticket.status} />
      </div>

      {/* Session ID */}
      <span className="font-mono text-xs text-slate-400 dark:text-slate-500 truncate">
        Session: {ticket.session_id.slice(0, 12)}…
      </span>

      {/* Priority + assigned */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
            ticket.priority === "high"
              ? "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300"
              : ticket.priority === "medium"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
                : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
          }`}
        >
          {ticket.priority}
        </span>
        {ticket.assigned_to && (
          <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
            → {ticket.assigned_to}
          </span>
        )}
      </div>

      {/* Footer: date + quick claim */}
      <div className="flex items-center justify-between gap-2 mt-auto">
        <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
          {new Date(ticket.created_at).toLocaleDateString()}
        </span>
        {onClaim && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClaim();
            }}
            className="text-xs px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors"
          >
            Claim
          </button>
        )}
      </div>
    </button>
  );
}
