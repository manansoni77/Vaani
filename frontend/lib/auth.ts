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

// ---------------------------------------------------------------------------
// Google JWT payload (subset of standard claims we care about)
// ---------------------------------------------------------------------------

export type GoogleJwtPayload = {
  sub: string;       // Google user ID
  email: string;
  name: string;
  picture?: string;  // Avatar URL
  given_name?: string;
  family_name?: string;
};

/** Decode the payload of a Google credential JWT without verifying the
 *  signature (safe for display-only use on the client). */
export function decodeGoogleJwt(token: string): GoogleJwtPayload | null {
  try {
    const payloadB64 = token.split(".")[1];
    const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as GoogleJwtPayload;
  } catch {
    return null;
  }
}
