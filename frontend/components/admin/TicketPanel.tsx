"use client";

import { useState } from "react";
import type { Ticket, TicketStatus } from "@/lib/types";
import { claimTicket, rerouteTicket, updateTicketStatus, addTicketComment } from "@/lib/api";
import { CloseIcon, SpinnerIcon } from "@/components/ui/icons";
import { TicketStatusBadge } from "@/components/admin/badges";
import { useDepartments } from "@/contexts/DepartmentContext";
import { useUser } from "@/contexts/UserContext";
import { SessionDetailPanel } from "@/components/admin/SessionDetailPanel";

interface Props {
  ticket: Ticket;
  onClose: () => void;
  onUpdate: (updated: Ticket) => void;
}

const PRIORITY_CLS: Record<string, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  low: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

export function TicketPanel({ ticket, onClose, onUpdate }: Props) {
  const { profile } = useUser();
  const { departments } = useDepartments();

  const [claiming, setClaiming] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState<number | "">("");
  const [commentText, setCommentText] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);

  const role = profile?.accessLevel;
  const deptName = departments.find((d) => d.id === ticket.routed_department_id)?.name ?? null;

  const canClaim =
    ticket.status === "in_review" &&
    role != null &&
    ["call_center_admin", "call_center_user", "dept_admin", "dept_user", "super_admin"].includes(role);

  const canResolve =
    ticket.status === "in_progress" &&
    role != null &&
    ["super_admin", "call_center_admin", "call_center_user", "dept_admin", "dept_user"].includes(role);

  const canClose =
    ticket.status === "resolved" &&
    role != null &&
    ["super_admin", "call_center_admin", "dept_admin"].includes(role);

  const canReroute =
    role != null &&
    ["super_admin", "call_center_admin", "call_center_user", "dept_admin", "dept_user"].includes(role) &&
    (ticket.status === "in_review" || ticket.status === "in_progress");

  const handleClaim = async () => {
    setClaiming(true);
    try { onUpdate(await claimTicket(ticket.id)); }
    finally { setClaiming(false); }
  };

  const handleStatusUpdate = async (status: TicketStatus) => {
    setUpdating(true);
    try { onUpdate(await updateTicketStatus(ticket.id, status)); }
    finally { setUpdating(false); }
  };

  const handleReroute = async () => {
    if (!selectedDeptId) return;
    setRerouting(true);
    try {
      onUpdate(await rerouteTicket(ticket.id, selectedDeptId as number));
      setSelectedDeptId("");
    } finally { setRerouting(false); }
  };

  const handleComment = async () => {
    const msg = commentText.trim();
    if (!msg) return;
    setCommenting(true);
    try {
      onUpdate(await addTicketComment(ticket.id, msg));
      setCommentText("");
    } finally { setCommenting(false); }
  };

  if (viewingSessionId) {
    return (
      <SessionDetailPanel
        sessionId={viewingSessionId}
        onBack={() => setViewingSessionId(null)}
      />
    );
  }

  return (
    <div className="p-4 flex flex-col gap-5 min-w-0">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Ticket #{ticket.id}
          </h2>
          <TicketStatusBadge status={ticket.status} />
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${PRIORITY_CLS[ticket.priority] ?? PRIORITY_CLS.low}`}>
            {ticket.priority}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          aria-label="Close panel"
        >
          <CloseIcon />
        </button>
      </div>

      {/* ── Overview grid ── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-0.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2.5">
          <span className="text-xs text-slate-400">Department</span>
          <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
            {deptName ?? <span className="italic text-slate-400">Unrouted</span>}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2.5">
          <span className="text-xs text-slate-400">Assigned To</span>
          <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
            {ticket.assigned_to ?? <span className="italic text-slate-400">Unassigned</span>}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2.5">
          <span className="text-xs text-slate-400">Created</span>
          <span className="text-xs font-mono text-slate-700 dark:text-slate-200">
            {new Date(ticket.created_at).toLocaleString()}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2.5">
          <span className="text-xs text-slate-400">Last Updated</span>
          <span className="text-xs font-mono text-slate-700 dark:text-slate-200">
            {new Date(ticket.updated_at).toLocaleString()}
          </span>
        </div>
      </div>

      {/* ── Description ── */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Description
        </span>
        {ticket.description ? (
          <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2.5 leading-relaxed">
            {ticket.description}
          </p>
        ) : (
          <p className="text-xs text-slate-400 dark:text-slate-500 italic">No description</p>
        )}
      </div>

      {/* ── Sessions ── */}
      {ticket.session_ids.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Sessions ({ticket.session_ids.length})
          </span>
          <div className="flex flex-col gap-1">
            {ticket.session_ids.map((sid) => (
              <button
                key={sid}
                onClick={() => setViewingSessionId(sid)}
                className="font-mono text-xs bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg px-3 py-1.5 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 truncate text-left transition-colors"
                title="View session details"
              >
                {sid}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      {(canClaim || canResolve || canClose) && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Actions
          </span>
          <div className="flex flex-col gap-2">
            {canClaim && (
              <button
                onClick={handleClaim}
                disabled={claiming}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {claiming && <SpinnerIcon className="w-4 h-4 animate-spin" />}
                Claim Ticket
              </button>
            )}
            {canResolve && (
              <button
                onClick={() => handleStatusUpdate("resolved")}
                disabled={updating}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {updating && <SpinnerIcon className="w-4 h-4 animate-spin" />}
                Mark Resolved
              </button>
            )}
            {canClose && (
              <button
                onClick={() => handleStatusUpdate("closed")}
                disabled={updating}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-600 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {updating && <SpinnerIcon className="w-4 h-4 animate-spin" />}
                Close Ticket
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Reroute ── */}
      {canReroute && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Reroute to Department
          </span>
          <div className="flex gap-2">
            <select
              value={selectedDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value ? Number(e.target.value) : "")}
              className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-400"
            >
              <option value="">Select department…</option>
              {departments.filter((d) => d.active).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <button
              onClick={handleReroute}
              disabled={rerouting || !selectedDeptId}
              className="px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
            >
              {rerouting && <SpinnerIcon className="w-4 h-4 animate-spin" />}
              Reroute
            </button>
          </div>
        </div>
      )}

      {/* ── Comments ── */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
          Comments {ticket.comments.length > 0 && `(${ticket.comments.length})`}
        </span>

        {ticket.comments.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 italic">No comments yet</p>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
            {ticket.comments.map((c, i) => (
              <div
                key={i}
                className="text-xs bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2 leading-relaxed"
              >
                <p className="text-slate-700 dark:text-slate-300">{c.msg}</p>
                <p className="text-slate-400 dark:text-slate-500 mt-0.5 font-mono">{c.by}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleComment()}
            placeholder="Add a comment…"
            disabled={commenting}
            className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
          <button
            onClick={handleComment}
            disabled={commenting || !commentText.trim()}
            className="px-4 py-1.5 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            {commenting && <SpinnerIcon className="w-4 h-4 animate-spin" />}
            Send
          </button>
        </div>
      </div>

    </div>
  );
}
