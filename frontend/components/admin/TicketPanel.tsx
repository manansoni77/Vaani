"use client";

import { useState } from "react";
import type { Ticket, TicketStatus } from "@/lib/types";
import { claimTicket, rerouteTicket, updateTicketStatus } from "@/lib/api";
import { CloseIcon, SpinnerIcon } from "@/components/ui/icons";
import { TicketStatusBadge } from "@/components/admin/badges";
import { useDepartments } from "@/contexts/DepartmentContext";
import { useUser } from "@/contexts/UserContext";

interface Props {
  ticket: Ticket;
  onClose: () => void;
  onUpdate: (updated: Ticket) => void;
}

export function TicketPanel({ ticket, onClose, onUpdate }: Props) {
  const { profile } = useUser();
  const { departments } = useDepartments();

  const [claiming, setClaiming] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [selectedDeptId, setSelectedDeptId] = useState<number | "">("");

  const role = profile?.accessLevel;

  const canClaim =
    ticket.status === "in_review" &&
    role != null &&
    ["call_center_admin", "call_center_user", "dept_admin", "dept_user", "super_admin"].includes(role);

  const canResolve =
    ticket.status === "in_progress" &&
    (ticket.assigned_to === profile?.email || role === "super_admin" || role === "dept_admin" || role === "call_center_admin");

  const canClose =
    ticket.status === "resolved" &&
    (role === "super_admin" || role === "dept_admin" || role === "call_center_admin");

  const canReroute =
    role != null &&
    ["call_center_admin", "super_admin"].includes(role) &&
    ticket.status !== "closed";

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const updated = await claimTicket(ticket.id);
      onUpdate(updated);
    } finally {
      setClaiming(false);
    }
  };

  const handleStatusUpdate = async (status: TicketStatus) => {
    setUpdating(true);
    try {
      const updated = await updateTicketStatus(ticket.id, status);
      onUpdate(updated);
    } finally {
      setUpdating(false);
    }
  };

  const handleReroute = async () => {
    if (!selectedDeptId) return;
    setRerouting(true);
    try {
      const updated = await rerouteTicket(ticket.id, selectedDeptId as number);
      onUpdate(updated);
      setSelectedDeptId("");
    } finally {
      setRerouting(false);
    }
  };

  return (
    <div className="p-4 flex flex-col gap-4 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
          Ticket #{ticket.id}
        </h2>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          aria-label="Close panel"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Ticket info */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Status & Priority
          </span>
          <div className="flex flex-wrap gap-1.5">
            <TicketStatusBadge status={ticket.status} />
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
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Session
          </span>
          <span className="font-mono text-xs bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2 text-slate-700 dark:text-slate-300 break-all">
            {ticket.session_id}
          </span>
        </div>

        {ticket.assigned_to && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Assigned To
            </span>
            <span className="text-sm text-slate-700 dark:text-slate-300">{ticket.assigned_to}</span>
          </div>
        )}

        {ticket.description && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              Description
            </span>
            <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2.5 leading-relaxed">
              {ticket.description}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1 bg-slate-50 dark:bg-slate-700/50 rounded-lg px-3 py-2.5">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Created</span>
            <span className="font-mono text-slate-600 dark:text-slate-300">
              {new Date(ticket.created_at).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Updated</span>
            <span className="font-mono text-slate-600 dark:text-slate-300">
              {new Date(ticket.updated_at).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Actions */}
      {(canClaim || canResolve || canClose) && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            Actions
          </span>

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
      )}

      {/* Reroute */}
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
    </div>
  );
}
