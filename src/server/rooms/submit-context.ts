// Session context of a Submit (docs/specs/rooms.md §3.4 "Validation at submit
// time", §8.3). `checkSubmitSession` runs after the problem lookup (PLAN §6
// step 5); `recheckSubmitSession` runs again inside the insert transaction,
// after the per-user lock, under the session lock, so a submit can never be
// inserted after a concurrent end or expiry has committed.
import { and, eq, sql } from "drizzle-orm";

import {
  JOIN_FIRST,
  NOT_IN_SESSION,
  SESSION_NOT_FOUND,
  SUBMIT_SESSION_ENDED,
} from "@/lib/rooms/session-view";
import type { Db } from "@/server/db";
import { roomMembers, roomSessionParticipants, roomSessionProblems, roomSessions } from "@/server/db/schema";

import { lockSession } from "./events";
import { closeIfDueNow } from "./lifecycle";
import type { Tx } from "./queries";

export type SessionSubmitRejection = { status: 400 | 404 | 409; error: string; code: string };

export type SessionSubmitInput = { sessionId: string; userId: string; problemId: string };

const notFound: SessionSubmitRejection = { status: 404, error: SESSION_NOT_FOUND, code: "session_not_found" };
const ended: SessionSubmitRejection = { status: 409, error: SUBMIT_SESSION_ENDED, code: "session_ended" };

async function loadContext(db: Pick<Db, "select">, input: SessionSubmitInput) {
  const [row] = await db
    .select({
      status: roomSessions.status,
      open: sql<boolean>`(${roomSessions.status} = 'live' AND clock_timestamp() < ${roomSessions.endsAt})`,
      member: sql<boolean>`(${roomMembers.userId} IS NOT NULL)`,
      participant: sql<boolean>`(${roomSessionParticipants.userId} IS NOT NULL)`,
      position: roomSessionProblems.position,
    })
    .from(roomSessions)
    .leftJoin(roomMembers, and(eq(roomMembers.roomId, roomSessions.roomId), eq(roomMembers.userId, input.userId)))
    .leftJoin(
      roomSessionParticipants,
      and(eq(roomSessionParticipants.sessionId, roomSessions.id), eq(roomSessionParticipants.userId, input.userId)),
    )
    .leftJoin(
      roomSessionProblems,
      and(eq(roomSessionProblems.sessionId, roomSessions.id), eq(roomSessionProblems.problemId, input.problemId)),
    )
    .where(eq(roomSessions.id, input.sessionId))
    .limit(1);
  return row ?? null;
}

function judge(row: Awaited<ReturnType<typeof loadContext>>): SessionSubmitRejection | null {
  // Non-members (including removed members) never learn the session exists.
  if (!row || !row.member) return notFound;
  if (!row.participant) return { status: 409, error: JOIN_FIRST, code: "join_first" };
  if (row.position === null) return { status: 400, error: NOT_IN_SESSION, code: "not_in_session" };
  if (!row.open) return ended;
  return null;
}

/** Step 5b: membership, participation, problem in session, live window (lazy close first). */
export async function checkSubmitSession(db: Db, input: SessionSubmitInput): Promise<SessionSubmitRejection | null> {
  const row = await loadContext(db, input);
  const rejection = judge(row);
  if (rejection === ended && row?.status === "live") await closeIfDueNow(db, input.sessionId);
  return rejection;
}

/** Inside the insert transaction: the same checks under the session lock. */
export async function recheckSubmitSession(tx: Tx, input: SessionSubmitInput): Promise<SessionSubmitRejection | null> {
  await lockSession(tx, input.sessionId);
  return judge(await loadContext(tx, input));
}
