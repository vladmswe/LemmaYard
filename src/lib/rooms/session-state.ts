// Session state machine (docs/specs/rooms.md §7.3):
//   lobby ──start──► live ──end (host) / expire (time)──► finished
//   lobby ──cancel / stale──► cancelled
// Pure: callers apply the result in a transaction under the session lock.
import type { RoomSessionEndReason, RoomSessionStatus } from "./types";

export type SessionAction = "start" | "cancel" | "stale" | "end" | "expire";

export type TransitionErrorCode =
  /** 409 "End the session instead" (cancel on live). */
  | "end_instead"
  /** 409: the session is not in a state that allows the action. */
  | "invalid_state";

export type TransitionResult =
  | { ok: true; changed: true; next: RoomSessionStatus; endReason: RoomSessionEndReason | null }
  /** Idempotent no-op (e.g. end on an already finished session). */
  | { ok: true; changed: false; next: RoomSessionStatus }
  | { ok: false; code: TransitionErrorCode };

const TABLE: Record<
  SessionAction,
  { from: RoomSessionStatus; to: RoomSessionStatus; endReason: RoomSessionEndReason | null }
> = {
  start: { from: "lobby", to: "live", endReason: null },
  cancel: { from: "lobby", to: "cancelled", endReason: "cancelled" },
  stale: { from: "lobby", to: "cancelled", endReason: "stale" },
  end: { from: "live", to: "finished", endReason: "host" },
  expire: { from: "live", to: "finished", endReason: "time" },
};

export function transition(status: RoomSessionStatus, action: SessionAction): TransitionResult {
  const rule = TABLE[action];
  if (status === rule.from) return { ok: true, changed: true, next: rule.to, endReason: rule.endReason };
  if (status === rule.to && (action === "end" || action === "expire")) {
    return { ok: true, changed: false, next: status };
  }
  if (action === "cancel" && status === "live") return { ok: false, code: "end_instead" };
  return { ok: false, code: "invalid_state" };
}

export function canTransition(status: RoomSessionStatus, action: SessionAction): boolean {
  const r = transition(status, action);
  return r.ok && r.changed;
}

/** Host powers (draw, re-roll, pin, start, end, cancel): the host or the room owner. */
export function canManageSession(
  viewer: { userId: string; role: "owner" | "member" },
  session: { hostId: string | null },
): boolean {
  return viewer.role === "owner" || (session.hostId !== null && session.hostId === viewer.userId);
}

/** Lobby or live: at most one per room (`room_sessions_one_open`). */
export function isOpenStatus(status: RoomSessionStatus): boolean {
  return status === "lobby" || status === "live";
}

export function isTerminalStatus(status: RoomSessionStatus): boolean {
  return status === "finished" || status === "cancelled";
}

/** A lobby older than this is cancelled with end_reason 'stale' on the next read. */
export const STALE_LOBBY_MS = 7 * 24 * 60 * 60 * 1000;

export function isStaleLobby(session: { status: RoomSessionStatus; createdAt: Date }, now: Date): boolean {
  return session.status === "lobby" && now.getTime() - session.createdAt.getTime() >= STALE_LOBBY_MS;
}

/** Live and `now >= ends_at`: lazy close sets finished with ended_at = ends_at. */
export function isExpired(session: { status: RoomSessionStatus; endsAt: Date | null }, now: Date): boolean {
  return session.status === "live" && session.endsAt !== null && now.getTime() >= session.endsAt.getTime();
}

export function computeEndsAt(startedAt: Date, durationMin: number): Date {
  return new Date(startedAt.getTime() + durationMin * 60_000);
}

/** The lazy-close action due at `now`, if any. */
export function dueAction(
  session: { status: RoomSessionStatus; createdAt: Date; endsAt: Date | null },
  now: Date,
): "expire" | "stale" | null {
  if (isExpired(session, now)) return "expire";
  if (isStaleLobby(session, now)) return "stale";
  return null;
}

/** Status as a viewer should see it now (a live session past ends_at reads as finished). */
export function effectiveStatus(
  session: { status: RoomSessionStatus; createdAt: Date; endsAt: Date | null },
  now: Date,
): RoomSessionStatus {
  const action = dueAction(session, now);
  return action ? TABLE[action].to : session.status;
}
