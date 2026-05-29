import { API_BASE } from "@/lib/config";

// ---------------------------------------------------------------------------
// Module-level token store
// Kept outside React so plain utility functions can read it.
// UserProvider calls setApiToken() whenever auth state changes.
// ---------------------------------------------------------------------------

let _token: string | null = null;

/** Called by UserProvider — do not call from other places. */
export function setApiToken(token: string | null): void {
  _token = token;
}

/** Returns the current token (useful for one-off access outside React). */
export function getApiToken(): string | null {
  return _token;
}

// ---------------------------------------------------------------------------
// Authenticated fetch helper
// ---------------------------------------------------------------------------

/**
 * Drop-in replacement for `fetch(${API_BASE}/path)`.
 * - Automatically adds `Authorization: Bearer <token>` when a token is set.
 * - Throws on non-2xx responses with a human-readable message.
 * - Returns the parsed JSON body typed as T.
 *
 * @example
 *   const sessions = await apiFetch<Session[]>("/sessions");
 *   const data     = await apiFetch<UserProfile>("/users/me");
 */
export async function apiFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);

  if (_token) {
    headers.set("Authorization", `Bearer ${_token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status} – ${res.statusText}${body ? `: ${body}` : ""}`);
  }

  return res.json() as Promise<T>;
}
