// GET /api/rooms/:roomId/sessions/:sessionId/state?after=<cursor>
// (docs/specs/rooms.md §3.2, §3.3, §7.2). The one endpoint the live UI polls.
//
// Queries: (1) the signed-in user, (2) membership + session + server clock +
// latest event id + pending judging in one statement (Q0 merged with the
// session read and Q10), (3) events after the cursor (Q6, skipped when the
// cursor is already the latest). A snapshot adds two (problems; participants
// with their result cells, Q11). A due lazy close adds one transaction.
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  decodeCursor,
  encodeCursor,
  EVENT_PAGE_SIZE,
  toRoomEvent,
  type RoomEvent,
  type SessionSnapshot,
  type StateResponse,
} from "@/lib/rooms/events";
import { STATE_POLLS_PER_MIN, STATE_RETRY_AFTER_SEC } from "@/lib/rooms/session-schemas";
import { canManageSession, dueAction } from "@/lib/rooms/session-state";
import { buildSessionSnapshot } from "@/lib/rooms/session-view";
import type { Difficulty, RoomRole } from "@/lib/rooms/types";
import { getCurrentUser } from "@/server/auth/session";
import { getDb, type Db } from "@/server/db";
import {
  problems,
  roomEvents,
  roomMembers,
  roomSessionParticipants,
  roomSessionProblems,
  roomSessions,
  users,
} from "@/server/db/schema";
import { jsonError } from "@/server/http/request";
import { createRateLimiter } from "@/server/http/rate-limit";

import { json, SIGN_IN_REQUIRED, tooMany } from "./http";
import { closeIfDueNow } from "./lifecycle";
import { sessionNotFound } from "./sessions";

/** §7.2: 120 polls per minute per user (in-process, soft). */
export const statePollLimiter = createRateLimiter({ limit: STATE_POLLS_PER_MIN, windowMs: 60_000 });

const idSchema = z.uuid();

/** State response plus who the viewer is in this session (for the R4 UI). */
export type SessionStateResponse = StateResponse & {
  viewer: { isParticipant: boolean; canManage: boolean };
};

async function loadGate(db: Db, roomId: string, sessionId: string, userId: string) {
  const [row] = await db
    .select({
      status: roomSessions.status,
      hostId: roomSessions.hostId,
      createdAt: roomSessions.createdAt,
      startedAt: roomSessions.startedAt,
      endsAt: roomSessions.endsAt,
      durationMin: roomSessions.durationMin,
      problemCount: roomSessions.problemCount,
      role: roomMembers.role,
      isParticipant: sql<boolean>`(${roomSessionParticipants.userId} IS NOT NULL)`,
      now: sql<string>`clock_timestamp()`,
      latest: sql<string | null>`(SELECT max(e.id) FROM room_events e WHERE e.session_id = ${roomSessions.id})::text`,
      pending: sql<number>`(SELECT count(*) FROM submissions x
        WHERE x.room_session_id = ${roomSessions.id} AND x.status IN ('queued', 'running'))::int`,
    })
    .from(roomSessions)
    .innerJoin(roomMembers, and(eq(roomMembers.roomId, roomSessions.roomId), eq(roomMembers.userId, userId)))
    .leftJoin(
      roomSessionParticipants,
      and(eq(roomSessionParticipants.sessionId, roomSessions.id), eq(roomSessionParticipants.userId, userId)),
    )
    .where(and(eq(roomSessions.id, sessionId), eq(roomSessions.roomId, roomId)))
    .limit(1);
  return row ? { ...row, now: new Date(row.now), role: row.role as RoomRole } : null;
}

async function loadEvents(db: Db, sessionId: string, after: bigint) {
  return db
    .select({
      id: roomEvents.id,
      type: roomEvents.type,
      actorUserId: roomEvents.actorUserId,
      actorUsername: users.username,
      payload: roomEvents.payload,
      createdAt: roomEvents.createdAt,
    })
    .from(roomEvents)
    .leftJoin(users, eq(users.id, roomEvents.actorUserId))
    .where(and(eq(roomEvents.sessionId, sessionId), gt(roomEvents.id, after)))
    .orderBy(asc(roomEvents.id))
    .limit(EVENT_PAGE_SIZE + 1);
}

type ResultJson = {
  position: number;
  attempts: number;
  wrongBefore: number;
  solveSeconds: number | null;
  firstAcceptedAt: string | null;
  solvedBefore: boolean;
};

async function loadSnapshot(
  db: Db,
  sessionId: string,
  gate: NonNullable<Awaited<ReturnType<typeof loadGate>>>,
  revealTitles: boolean,
): Promise<SessionSnapshot> {
  const [slotRows, participantRows] = await Promise.all([
    db
      .select({
        position: roomSessionProblems.position,
        slug: problems.slug,
        title: problems.title,
        difficulty: roomSessionProblems.difficulty,
        tags: sql<string[]>`coalesce((
          SELECT array_agg(t.slug ORDER BY t.slug) FROM problem_tags pt JOIN tags t ON t.id = pt.tag_id
          WHERE pt.problem_id = "problems"."id"), '{}')`,
      })
      .from(roomSessionProblems)
      .innerJoin(problems, eq(problems.id, roomSessionProblems.problemId))
      .where(eq(roomSessionProblems.sessionId, sessionId)),
    db
      .select({
        userId: roomSessionParticipants.userId,
        username: users.username,
        joinedAt: roomSessionParticipants.joinedAt,
        solvedCount: roomSessionParticipants.solvedCount,
        penaltySec: roomSessionParticipants.penaltySec,
        rank: roomSessionParticipants.rank,
        results: sql<ResultJson[]>`coalesce((
          SELECT json_agg(json_build_object(
            'position', r.position, 'attempts', r.attempts, 'wrongBefore', r.wrong_before_accept,
            'solveSeconds', r.solve_seconds, 'firstAcceptedAt', r.first_accepted_at,
            'solvedBefore', r.solved_before) ORDER BY r.position)
          FROM room_session_results r
          WHERE r.session_id = ${roomSessionParticipants.sessionId} AND r.user_id = ${roomSessionParticipants.userId}
        ), '[]'::json)`,
      })
      .from(roomSessionParticipants)
      .innerJoin(users, eq(users.id, roomSessionParticipants.userId))
      .where(eq(roomSessionParticipants.sessionId, sessionId)),
  ]);
  return buildSessionSnapshot({
    session: {
      status: gate.status,
      startedAt: gate.startedAt,
      endsAt: gate.endsAt,
      durationMin: gate.durationMin,
      problemCount: gate.problemCount,
      hostId: gate.hostId,
    },
    problems: slotRows.map((s) => ({ ...s, difficulty: s.difficulty as Difficulty })),
    participants: participantRows.map((p) => ({
      ...p,
      results: p.results.map((r) => ({
        ...r,
        firstAcceptedAt: r.firstAcceptedAt ? new Date(r.firstAcceptedAt) : null,
      })),
    })),
    revealTitles,
  });
}

export async function getSessionState(request: Request, roomId: string, sessionId: string): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, SIGN_IN_REQUIRED);
  if (!idSchema.safeParse(roomId).success || !idSchema.safeParse(sessionId).success) return sessionNotFound();
  const limited = statePollLimiter.hit(user.id);
  if (!limited.ok) return tooMany("Too many updates requested; slowing down", STATE_RETRY_AFTER_SEC);

  const params = new URL(request.url).searchParams;
  const after = decodeCursor(params.get("after"));
  const wantSnapshot = params.get("snapshot") === "1";

  const db = getDb();
  let gate = await loadGate(db, roomId, sessionId, user.id);
  if (!gate) return sessionNotFound();
  if (dueAction(gate, gate.now)) {
    await closeIfDueNow(db, sessionId);
    gate = await loadGate(db, roomId, sessionId, user.id);
    if (!gate) return sessionNotFound();
  }

  const latest = gate.latest === null ? BigInt(0) : BigInt(gate.latest);
  // A cursor beyond the newest event (or none) means "fresh snapshot, no events".
  const valid = after !== null && after <= latest;
  let cursor = valid ? after : latest;
  let events: RoomEvent[] = [];
  let hasMore = false;
  let fetched = 0;
  if (valid && after < latest) {
    const rows = await loadEvents(db, sessionId, after);
    hasMore = rows.length > EVENT_PAGE_SIZE;
    const page = rows.slice(0, EVENT_PAGE_SIZE);
    fetched = page.length;
    if (page.length > 0) cursor = page[page.length - 1].id;
    events = page.map(toRoomEvent).filter((e): e is RoomEvent => e !== null);
  }

  const canManage = canManageSession({ userId: user.id, role: gate.role }, { hostId: gate.hostId });
  const body: SessionStateResponse = {
    serverNow: gate.now.toISOString(),
    status: gate.status,
    endsAt: gate.endsAt?.toISOString() ?? null,
    cursor: encodeCursor(cursor),
    events,
    hasMore,
    pendingJudging: gate.pending,
    viewer: { isParticipant: gate.isParticipant, canManage },
  };
  if (!valid || fetched > 0 || wantSnapshot) {
    body.snapshot = await loadSnapshot(db, sessionId, gate, canManage || gate.startedAt !== null);
  }
  return json(body);
}
