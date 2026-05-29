// ---------------------------------------------------------------------------
// Auth types
// ---------------------------------------------------------------------------

/** Auth state persisted after a successful sign-in.
 *  Stores the app JWT (returned by POST /auth/google) rather than the raw
 *  Google credential, which is discarded after the exchange.
 *  `picture` is captured from the Google JWT before it is discarded since
 *  the backend does not store or return it.
 */
export type AuthUser = {
  accessToken: string;  // signed app JWT from POST /auth/google
  picture?: string;     // Google profile picture URL (client-only, not in DB)
};

export const AUTH_STORAGE_KEY = "vaani_auth";

// ---------------------------------------------------------------------------
// Google JWT payload (used only during the sign-in exchange)
// ---------------------------------------------------------------------------

export type GoogleJwtPayload = {
  sub: string;
  email: string;
  name: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
};

/** Decode the payload of a Google credential JWT without verifying the
 *  signature. Used only to extract `picture` before the credential is
 *  discarded after the token exchange. */
export function decodeGoogleJwt(token: string): GoogleJwtPayload | null {
  try {
    const payloadB64 = token.split(".")[1];
    const json = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as GoogleJwtPayload;
  } catch {
    return null;
  }
}
