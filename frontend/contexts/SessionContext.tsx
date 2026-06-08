"use client";

import { createContext, useContext, useRef, useCallback, type ReactNode } from "react";
import { getSessionHistoryById, getSessionById } from "@/lib/api";
import type { Session } from "@/lib/types";

interface SessionContextValue {
  /**
   * Fetch a session by ID. Tries history first (most sessions viewed from
   * tickets will be completed). Falls back to the live endpoint if the
   * history endpoint returns 404. Results are cached by ID for the lifetime
   * of the provider so the same session is never fetched twice.
   */
  fetchSession: (id: string) => Promise<Session>;
  /** Evict a session from the cache (e.g. after a live update). */
  evict: (id: string) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const cacheRef = useRef<Map<string, Session>>(new Map());
  // Track in-flight promises so concurrent calls for the same ID don't
  // issue duplicate requests.
  const inflightRef = useRef<Map<string, Promise<Session>>>(new Map());

  const fetchSession = useCallback(async (id: string): Promise<Session> => {
    const cached = cacheRef.current.get(id);
    if (cached) return cached;

    const inflight = inflightRef.current.get(id);
    if (inflight) return inflight;

    const promise = (async () => {
      let session: Session;
      try {
        session = await getSessionHistoryById(id);
      } catch {
        session = await getSessionById(id);
      }
      cacheRef.current.set(id, session);
      inflightRef.current.delete(id);
      return session;
    })();

    inflightRef.current.set(id, promise);
    return promise;
  }, []);

  const evict = useCallback((id: string) => {
    cacheRef.current.delete(id);
  }, []);

  return (
    <SessionContext.Provider value={{ fetchSession, evict }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
