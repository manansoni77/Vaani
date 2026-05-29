// ---------------------------------------------------------------------------
// User profile types
// ---------------------------------------------------------------------------

export type AdminContact = {
  name: string;
  email: string;
};

/** Full user profile — sourced from the backend /users/me endpoint.
 *  Fields from the Google JWT (name, email, googleId, picture) are merged in
 *  by UserContext so the consumer always gets one unified object.
 */
export type UserProfile = {
  // ── Identity (from Google JWT) ─────────────────────────────────────────
  name: string;
  email: string;
  googleId: string;
  picture?: string;

  // ── Org data (from backend) ────────────────────────────────────────────
  department: string;
  accessLevel: string;
  userSince: string; // ISO date string, e.g. "2024-03-15"

  // ── Admin hierarchy (from backend) ────────────────────────────────────
  deptAdmin: AdminContact;
  itAdmin: AdminContact;
  superAdmin: AdminContact;
};

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export const USER_STORAGE_KEY = "vaani_user_profile";

// ---------------------------------------------------------------------------
// Mock data — replace the commented block in UserContext.fetchProfile()
// with a real apiFetch call once the endpoint exists.
// ---------------------------------------------------------------------------

/** The slice of UserProfile that comes from the backend (not the JWT). */
export type BackendUserProfile = Omit<UserProfile, "name" | "email" | "googleId" | "picture">;

export const MOCK_BACKEND_PROFILE: BackendUserProfile = {
  department: "Emergency Response Unit",
  accessLevel: "Operator",
  userSince: "2024-03-15",
  deptAdmin: {
    name: "Priya Sharma",
    email: "priya.sharma@vaani.gov.in",
  },
  itAdmin: {
    name: "Rohan Mehta",
    email: "rohan.mehta@vaani.gov.in",
  },
  superAdmin: {
    name: "Ananya Iyer",
    email: "ananya.iyer@vaani.gov.in",
  },
};
