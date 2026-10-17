"use client";

// Optional context of the problem page's Submit (Rooms, docs/specs/rooms.md
// §3.4, §7.4 SessionBanner). A banner above the workspace registers the live
// session the Submit should count for; SolveWorkspace reads it. Only Submit
// carries it, never Run. Without a provider (or with nothing registered) the
// page behaves exactly as before.
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type SubmitSessionContext = {
  roomSessionId: string;
  /** "Saturday Algo Club · Problem 2 of 4", shown in the console. */
  label: string;
  /** Joins the session (for the "Join the session first" rejection); resolves true on success. */
  join: () => Promise<boolean>;
};

type Value = {
  session: SubmitSessionContext | null;
  setSession: (s: SubmitSessionContext | null) => void;
};

const Ctx = createContext<Value | null>(null);

export function SubmitContextProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SubmitSessionContext | null>(null);
  const value = useMemo(() => ({ session, setSession }), [session]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The registered session, or null (no provider, or no live session). */
export function useSubmitSession(): SubmitSessionContext | null {
  return useContext(Ctx)?.session ?? null;
}

export function useSetSubmitSession(): (s: SubmitSessionContext | null) => void {
  const ctx = useContext(Ctx);
  return ctx?.setSession ?? noop;
}

function noop() {}

/** Window event fired after the user's own Submit got its final verdict (listeners poll at once). */
export const OWN_SUBMIT_FINAL_EVENT = "lemmayard:own-submit-final";
