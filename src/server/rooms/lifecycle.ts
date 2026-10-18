// Time-based session transitions (docs/specs/rooms.md §6.2 notes, §7.3).
// "Due" transitions are evaluated lazily by every request that touches a
// session (state poll, session mutations, join, submit validation) and, as a
// backstop, by the worker's periodic sweep: a live session past `ends_at`
// becomes finished with `ended_at = ends_at` and `session_ended`, a lobby older
// than 7 days becomes cancelled ('stale') with `session_cancelled`. Each
// transition runs under the session lock and is guarded by its source status,
// so concurrent callers apply it exactly once.
import { and, eq, inArray, lte, sql } from "drizzle-orm";

import { STALE_LOBBY_MS } from "@/lib/rooms/session-state";
import type { Db } from "@/server/db";
import { roomSessions } from "@/server/db/schema";

import { appendRoomEvent, lockSession } from "./events";
import { recomputeSessionScores } from "./outcome";
import type { Tx } from "./queries";
import { applyDueSessionRatings, applySessionRatings } from "./ratings";

export type DueResult = "expired" | "stale" | null;

const STALE_LOBBY_SEC = Math.round(STALE_LOBBY_MS / 1000);

/** Applies a due transition of one session. The caller may already hold the lock. */
export async function closeIfDue(tx: Tx, sessionId: string): Promise<DueResult> {
  await lockSession(tx, sessionId);
  const expired = await tx
    .update(roomSessions)
    .set({ status: "finished", endedAt: sql`${roomSessions.endsAt}`, endReason: "time" })
    .where(
      and(
        eq(roomSessions.id, sessionId),
        eq(roomSessions.status, "live"),
        lte(roomSessions.endsAt, sql`clock_timestamp()`),
      ),
    )
    .returning({ endedAt: roomSessions.endedAt });
  if (expired.length === 1) {
    await recomputeSessionScores(tx, sessionId);
    await appendRoomEvent(tx, sessionId, {
      type: "session_ended",
      payload: { endedAt: expired[0].endedAt!.toISOString(), reason: "time" },
    });
    // Rooms v2: a rated session updates the room's ratings once nothing is pending.
    await applySessionRatings(tx, sessionId);
    return "expired";
  }
  const stale = await tx
    .update(roomSessions)
    .set({ status: "cancelled", endedAt: sql`clock_timestamp()`, endReason: "stale" })
    .where(
      and(
        eq(roomSessions.id, sessionId),
        eq(roomSessions.status, "lobby"),
        lte(roomSessions.createdAt, sql`clock_timestamp() - make_interval(secs => ${STALE_LOBBY_SEC})`),
      ),
    )
    .returning({ id: roomSessions.id });
  if (stale.length === 1) {
    await appendRoomEvent(tx, sessionId, { type: "session_cancelled", payload: {} });
    return "stale";
  }
  return null;
}

/** closeIfDue in its own transaction (read paths that are not in one). */
export function closeIfDueNow(db: Db, sessionId: string): Promise<DueResult> {
  return db.transaction((tx) => closeIfDue(tx, sessionId));
}

/**
 * Worker backstop: closes every due session (expired live, stale lobby), one
 * transaction each, then applies ratings that waited for judging (v2 §6.6).
 * Returns the ids that changed.
 */
export async function sweepRoomSessions(db: Db): Promise<{ expired: string[]; stale: string[]; rated: string[] }> {
  const due = await db
    .select({ id: roomSessions.id })
    .from(roomSessions)
    .where(
      and(
        inArray(roomSessions.status, ["live", "lobby"]),
        sql`((${roomSessions.status} = 'live' AND ${roomSessions.endsAt} <= clock_timestamp())
          OR (${roomSessions.status} = 'lobby'
              AND ${roomSessions.createdAt} <= clock_timestamp() - make_interval(secs => ${STALE_LOBBY_SEC})))`,
      ),
    )
    .limit(500);
  const result = { expired: [] as string[], stale: [] as string[], rated: [] as string[] };
  for (const { id } of due) {
    const done = await closeIfDueNow(db, id);
    if (done === "expired") result.expired.push(id);
    if (done === "stale") result.stale.push(id);
  }
  result.rated = await applyDueSessionRatings(db);
  return result;
}
