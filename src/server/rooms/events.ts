// The single write path for room events (docs/specs/rooms.md §3.2, §3.3).
// Every transaction that appends an event for session S holds
// `pg_advisory_xact_lock(hashtext('rs:' || S))` until commit, so event ids of
// one session are allocated in commit order and `id > cursor` never skips.
// Lock order (no cycles): user lock (submit) → room lock → session lock; a
// holder of the session lock never takes a room or user lock.
import { sql } from "drizzle-orm";

import { sessionLockKey, validateNewRoomEvent, type NewRoomEvent } from "@/lib/rooms/events";
import { roomEvents } from "@/server/db/schema";

import type { Tx } from "./queries";

/** Drizzle client or transaction that can run raw SQL. */
type SqlExecutor = Pick<Tx, "execute">;

/** Takes the session's advisory xact lock (re-entrant within one transaction). */
export async function lockSession(tx: SqlExecutor, sessionId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${sessionLockKey(sessionId)}))`);
}

export type AppendedEvent = { id: bigint } | null;

/**
 * Validates and inserts one event under the session lock. `problem_solved`
 * is inserted with ON CONFLICT DO NOTHING on `room_events_one_solve`, so a
 * duplicate solve returns null instead of failing the transaction.
 */
export async function appendRoomEvent(tx: Tx, sessionId: string, event: NewRoomEvent): Promise<AppendedEvent> {
  const payload = validateNewRoomEvent(event);
  await lockSession(tx, sessionId);
  const insert = tx.insert(roomEvents).values({
    sessionId,
    type: event.type,
    actorUserId: event.actorUserId ?? null,
    payload,
  });
  const rows =
    event.type === "problem_solved"
      ? // The only unique constraint a new event can hit is room_events_one_solve.
        await insert.onConflictDoNothing().returning({ id: roomEvents.id })
      : await insert.returning({ id: roomEvents.id });
  const row = rows[0] ?? null;
  return row;
}

/**
 * After-commit hook for a push transport (v2: a payload-free Supabase
 * Broadcast "poke" `{cursor}` on topic `rs:<sessionId>`). A no-op in v1:
 * clients poll the state endpoint.
 */
export function notifyRoomEvent(sessionId: string, cursor: string): void {
  void sessionId;
  void cursor;
}
