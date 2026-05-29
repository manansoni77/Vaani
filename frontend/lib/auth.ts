// ---------------------------------------------------------------------------
// Auth types
// ---------------------------------------------------------------------------

/** Minimal auth state stored after a successful Google sign-in.
 *  Later: add appToken, role, email, name once the token-exchange
 *  endpoint exists on the backend.
 */
export type AuthUser = {
  /** Raw Google credential JWT — short-lived (~1 h). */
  googleCredential: string;
};

export const AUTH_STORAGE_KEY = "vaani_auth";
