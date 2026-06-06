/**
 * Typed API functions for every backend endpoint.
 * All calls go through apiFetch, which attaches Authorization: Bearer automatically.
 *
 * Usage:
 *   import { getDepartments, registerUser, getUsers } from "@/lib/api";
 */

import { apiFetch } from "@/lib/apiClient";
import type { Session, Ticket, TicketStatus, QueryType } from "@/lib/types";
import type { RoleType } from "@/lib/userStore";

// ============================================================================
// Departments
// ============================================================================

export type Department = {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type CreateDepartmentRequest = {
  name: string;
  description?: string;
};

/** Partial update — include only the fields you want to change. */
export type UpdateDepartmentRequest = {
  name?: string;
  description?: string;
  active?: boolean;
};

/** GET /departments — returns all departments ordered alphabetically by name. */
export function getDepartments(): Promise<Department[]> {
  return apiFetch<Department[]>("/departments");
}

/** POST /departments — super_admin only. */
export function createDepartment(data: CreateDepartmentRequest): Promise<Department> {
  return apiFetch<Department>("/departments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

/** PATCH /departments/{id} — super_admin only. */
export function updateDepartment(id: number, data: UpdateDepartmentRequest): Promise<Department> {
  return apiFetch<Department>(`/departments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ============================================================================
// Users
// ============================================================================

/** Shape shared by GET /users items and POST /users/register response. */
export type StaffUser = {
  id: number;
  name: string;
  email: string;
  role_type: RoleType;
  department_id: number | null;
  department_name: string | null;
  /** false when first registered (pending first Google sign-in), true once activated. */
  active: boolean;
};

export type RegisterUserRequest = {
  name: string;
  email: string;
  role_type: RoleType;
  /**
   * Required for dept_admin and dept_user.
   * Must be null / omitted for all other roles.
   */
  department_id?: number | null;
};

/**
 * GET /users — list users visible to the caller.
 *   super_admin       → all users
 *   call_center_admin → call_center_user accounts only
 *   dept_admin        → dept_user accounts in their own department only
 */
export function getUsers(): Promise<StaffUser[]> {
  return apiFetch<StaffUser[]>("/users");
}

/**
 * POST /users/register — pre-provision an account (active = false until first sign-in).
 *
 * Who can call this and what they can create:
 *   super_admin       → call_center_admin, call_center_user, dept_admin, dept_user
 *   call_center_admin → call_center_user
 *   dept_admin        → dept_user in their own department only
 */
export function registerUser(data: RegisterUserRequest): Promise<StaffUser> {
  return apiFetch<StaffUser>("/users/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// ============================================================================
// Sessions
// ============================================================================

export type SessionHistoryParams = {
  start_date?: string;
  end_date?: string;
  query_type?: QueryType;
  limit?: number;
  offset?: number;
  order?: "newest" | "oldest";
};

/** GET /sessions — active live sessions visible to the caller. */
export function getSessions(): Promise<Session[]> {
  return apiFetch<Session[]>("/sessions");
}

/** GET /sessions/history — completed sessions, role-scoped. */
export function getSessionsHistory(params: SessionHistoryParams = {}): Promise<Session[]> {
  const p = new URLSearchParams();
  if (params.start_date) p.set("start_date", params.start_date);
  if (params.end_date) p.set("end_date", params.end_date);
  if (params.query_type) p.set("query_type", params.query_type);
  if (params.limit != null) p.set("limit", String(params.limit));
  if (params.offset != null) p.set("offset", String(params.offset));
  if (params.order) p.set("order", params.order);
  const qs = p.toString();
  return apiFetch<Session[]>(`/sessions/history${qs ? `?${qs}` : ""}`);
}

/** POST /sessions/{id}/takeover — claim a live session for human handling. */
export function takeoverSession(
  sessionId: string,
  agentId: string,
): Promise<{ session_id: string; claimed_by: string }> {
  return apiFetch(`/sessions/${sessionId}/takeover`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agentId }),
  });
}

/**
 * POST /sessions/{id}/route — assign a live session to a department.
 * After this call the session leaves the call-center live dashboard and
 * appears in the target department's.
 */
export function routeSession(
  sessionId: string,
  departmentId: number,
): Promise<{ session_id: string; routed_department_id: number }> {
  return apiFetch(`/sessions/${sessionId}/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ department_id: departmentId }),
  });
}

// ============================================================================
// Tickets
// ============================================================================

export type GetTicketsParams = {
  status?: TicketStatus;
  limit?: number;
  offset?: number;
};

/** GET /tickets — list tickets visible to the caller, optionally filtered. */
export function getTickets(params: GetTicketsParams = {}): Promise<Ticket[]> {
  const p = new URLSearchParams();
  if (params.status) p.set("status", params.status);
  if (params.limit != null) p.set("limit", String(params.limit));
  if (params.offset != null) p.set("offset", String(params.offset));
  const qs = p.toString();
  return apiFetch<Ticket[]>(`/tickets${qs ? `?${qs}` : ""}`);
}

/**
 * POST /tickets/{id}/claim — assigns the ticket to the caller and moves it
 * from in_review → in_progress.
 */
export function claimTicket(id: number): Promise<Ticket> {
  return apiFetch<Ticket>(`/tickets/${id}/claim`, { method: "POST" });
}

/**
 * POST /tickets/{id}/reroute — move ticket to a different department (or
 * back to the call centre by passing null).
 */
export function rerouteTicket(id: number, departmentId: number | null): Promise<Ticket> {
  return apiFetch<Ticket>(`/tickets/${id}/reroute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ department_id: departmentId }),
  });
}

/** PATCH /tickets/{id}/status — update ticket status. */
export function updateTicketStatus(id: number, status: TicketStatus): Promise<Ticket> {
  return apiFetch<Ticket>(`/tickets/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

/** POST /tickets/{id}/comment — add a manual comment to a ticket. */
export function addTicketComment(id: number, msg: string): Promise<Ticket> {
  return apiFetch<Ticket>(`/tickets/${id}/comment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ msg }),
  });
}
