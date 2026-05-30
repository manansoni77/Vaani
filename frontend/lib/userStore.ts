// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type RoleType =
  | "it_admin"
  | "super_admin"
  | "call_center_admin"
  | "call_center_user"
  | "dept_admin"
  | "dept_user";

export type AdminContact = {
  name: string;
  email: string;
};

// ---------------------------------------------------------------------------
// Backend response shape — mirrors GET /users/me exactly
// ---------------------------------------------------------------------------

export type BackendUserResponse = {
  id: number;
  name: string;
  email: string;
  google_sub: string;
  role_type: RoleType;
  department_id: number | null;   // null for it_admin / super_admin
  department_name: string | null; // null for it_admin / super_admin
  active: boolean;
  created_at: string;             // ISO datetime string
  last_login_at: string | null;
  dept_admin: AdminContact | null;
  it_admin: AdminContact | null;
  super_admin: AdminContact | null;
};

// ---------------------------------------------------------------------------
// Frontend model — camelCase, picture merged in from Google JWT
// ---------------------------------------------------------------------------

export type UserProfile = {
  // ── Identity ───────────────────────────────────────────────────────────
  name: string;
  email: string;
  googleId: string;
  picture?: string;             // not in DB — captured from Google JWT at sign-in

  // ── Org ────────────────────────────────────────────────────────────────
  departmentId: number | null;  // null for it_admin / super_admin
  department: string | null;    // null for it_admin / super_admin
  accessLevel: RoleType;
  userSince: string;            // ISO datetime string

  // ── Admin hierarchy ────────────────────────────────────────────────────
  deptAdmin: AdminContact | null;
  itAdmin: AdminContact | null;
  superAdmin: AdminContact | null;
};

// ---------------------------------------------------------------------------
// Storage key
// ---------------------------------------------------------------------------

export const USER_STORAGE_KEY = "vaani_user_profile";

// ---------------------------------------------------------------------------
// Map backend response → frontend model
// ---------------------------------------------------------------------------

export function mapBackendUser(
  data: BackendUserResponse,
  picture: string | undefined,
): UserProfile {
  return {
    name: data.name,
    email: data.email,
    googleId: data.google_sub,
    picture,
    departmentId: data.department_id,
    department: data.department_name,
    accessLevel: data.role_type,
    userSince: data.created_at,
    deptAdmin: data.dept_admin,
    itAdmin: data.it_admin,
    superAdmin: data.super_admin,
  };
}
