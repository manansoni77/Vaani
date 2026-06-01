/**
 * Typed API functions for every backend endpoint.
 * All calls go through apiFetch, which attaches Authorization: Bearer automatically.
 *
 * Usage:
 *   import { getDepartments, registerUser, getUsers } from "@/lib/api";
 */

import { apiFetch } from "@/lib/apiClient";
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
