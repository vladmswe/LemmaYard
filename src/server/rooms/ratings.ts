// Per-room ratings on the server (docs/specs/rooms-v2.md §6, §11; owner
// decision D2: one rating per member PER ROOM on `room_members`). Lazy
// initialisation, the snapshots at start / late join, and the one-time
// application when a rated session is finished. The math is the pure core in
// src/lib/rooms/rating.ts.
//
// Locks: application runs under the session lock `rs:<id>` (the finish and
// finalize paths already hold it) and claims the session with
// `UPDATE … SET rated_at WHERE rated_at IS NULL`, so it happens exactly once.
// Member rows, then problem rows, are updated in ascending id order.
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  BAND_DEFAULT_RATING,
  clampAdjust,
  clampRating,
  computeSessionRatings,
  expectedSolves,
  isProvisional,
  startingRating,
  type SessionRatingUpdate,
} from "@/lib/rooms/rating";
import type { RatingSource } from "@/lib/rooms/types";
import type { Db } from "@/server/db";
import {
  problems,
  roomMembers,
  roomSessionParticipants,
  roomSessionProblems,
  roomSessionResults,
  roomSessions,
  submissions,
  users,
} from "@/server/db/schema";

import { lockSession } from "./events";
import type { Tx } from "./queries";

/** Ratings wait for pending judging at most this long after the end (§6.6). */
export const RATING_PENDING_GRACE_MIN = 30;

/** Effective problem rating in SQL: (author rating or band default) + adjust. */
export const problemRatingSql = sql<number>`((coalesce(${problems.authorRating}, CASE ${problems.difficulty}
  WHEN 'easy' THEN ${sql.raw(String(BAND_DEFAULT_RATING.easy))}
  WHEN 'medium' THEN ${sql.raw(String(BAND_DEFAULT_RATING.medium))}
  ELSE ${sql.raw(String(BAND_DEFAULT_RATING.hard))} END) + ${problems.ratingAdjust}))::int`;

type Executor = Tx | Db;

export type MemberRating = { userId: string; rating: number; ratedPairs: number; source: RatingSource };

/** Distinct problems each user solved outside sessions, with their effective rating (cold start rule 2). */
async function practiceRatings(tx: Executor, userIds: readonly string[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (userIds.length === 0) return out;
  const rows = await tx
    .selectDistinct({ userId: submissions.userId, problemId: problems.id, rating: problemRatingSql })
    .from(submissions)
    .innerJoin(problems, eq(problems.id, submissions.problemId))
    .where(
      and(
        inArray(submissions.userId, [...userIds]),
        eq(submissions.kind, "submit"),
        eq(submissions.status, "accepted"),
        isNull(submissions.roomSessionId),
      ),
    );
  for (const r of rows) out.set(r.userId, [...(out.get(r.userId) ?? []), Number(r.rating)]);
  return out;
}

/**
 * Lazy initialisation (§6.4 per room): members of `roomId` among `userIds`
 * without a rating get their starting rating (self-reported → practice →
 * 1500). Idempotent and race-safe (`WHERE rating IS NULL`). Returns the
 * current rating of every requested member (non-members are left out).
 */
export async function ensureMemberRatings(
  tx: Executor,
  roomId: string,
  userIds: readonly string[],
): Promise<Map<string, MemberRating>> {
  const ids = [...new Set(userIds)].sort();
  const result = new Map<string, MemberRating>();
  if (ids.length === 0) return result;
  const rows = await tx
    .select({
      userId: roomMembers.userId,
      rating: roomMembers.rating,
      ratedPairs: roomMembers.ratedPairs,
      source: roomMembers.ratingSource,
      selfReported: users.leetcodeRating,
    })
    .from(roomMembers)
    .innerJoin(users, eq(users.id, roomMembers.userId))
    .where(and(eq(roomMembers.roomId, roomId), inArray(roomMembers.userId, ids)))
    .orderBy(asc(roomMembers.userId));
  const missing = rows.filter((r) => r.rating === null);
  const practice = await practiceRatings(
    tx,
    missing.filter((r) => r.selfReported === null).map((r) => r.userId),
  );
  for (const r of rows) {
    if (r.rating !== null && r.source !== null) {
      result.set(r.userId, { userId: r.userId, rating: r.rating, ratedPairs: r.ratedPairs, source: r.source });
      continue;
    }
    const seed = startingRating({ selfReported: r.selfReported, practiceSolved: practice.get(r.userId) ?? [] });
    const [row] = await tx
      .update(roomMembers)
      .set({ rating: seed.rating, ratingSource: seed.source })
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, r.userId), isNull(roomMembers.rating)))
      .returning({ rating: roomMembers.rating, ratedPairs: roomMembers.ratedPairs, source: roomMembers.ratingSource });
    if (row) {
      result.set(r.userId, { userId: r.userId, rating: row.rating!, ratedPairs: row.ratedPairs, source: row.source! });
    } else {
      // Initialised concurrently: read the winner's value.
      const [now] = await tx
        .select({ rating: roomMembers.rating, ratedPairs: roomMembers.ratedPairs, source: roomMembers.ratingSource })
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, r.userId)));
      if (now?.rating != null && now.source !== null) {
        result.set(r.userId, { userId: r.userId, rating: now.rating, ratedPairs: now.ratedPairs, source: now.source });
      }
    }
  }
  return result;
}

/**
 * Snapshots at start (§6.2 "ratings at session start"): every participant's
 * room rating and every slot's effective problem rating. The caller holds the
 * session lock; the session has just turned live.
 */
export async function snapshotSessionStart(tx: Tx, session: { id: string; roomId: string }): Promise<void> {
  const participants = await tx
    .select({ userId: roomSessionParticipants.userId })
    .from(roomSessionParticipants)
    .where(eq(roomSessionParticipants.sessionId, session.id));
  await ensureMemberRatings(
    tx,
    session.roomId,
    participants.map((p) => p.userId),
  );
  await tx.execute(sql`
    UPDATE room_session_participants AS p SET rating_at_start = m.rating
    FROM room_members AS m
    WHERE p.session_id = ${session.id} AND m.room_id = ${session.roomId} AND m.user_id = p.user_id
  `);
  await tx
    .update(roomSessionProblems)
    .set({
      ratingAtStart: sql`(SELECT ${problemRatingSql} FROM ${problems} WHERE ${problems.id} = ${roomSessionProblems.problemId})`,
    })
    .where(eq(roomSessionProblems.sessionId, session.id));
}

/** A late join while live (§6.6): their start rating is the one at join time. */
export async function snapshotLateJoin(tx: Tx, session: { id: string; roomId: string }, userId: string): Promise<void> {
  const ratings = await ensureMemberRatings(tx, session.roomId, [userId]);
  const mine = ratings.get(userId);
  if (!mine) return;
  await tx
    .update(roomSessionParticipants)
    .set({ ratingAtStart: mine.rating })
    .where(
      and(
        eq(roomSessionParticipants.sessionId, session.id),
        eq(roomSessionParticipants.userId, userId),
        isNull(roomSessionParticipants.ratingAtStart),
      ),
    );
}

export type ApplyRatingsResult =
  | {
      applied: false;
      reason: "no_session" | "not_finished" | "unrated" | "already_applied" | "pending";
    }
  | { applied: true; update: SessionRatingUpdate };

/**
 * Applies the ratings of one finished rated session exactly once (§11):
 * waits while session submits are still judged, unless the session ended
 * more than 30 minutes ago. Inactive participants (no counted submit) get
 * delta 0 and keep their rating; members who left keep no room rating.
 */
export async function applySessionRatings(tx: Tx, sessionId: string): Promise<ApplyRatingsResult> {
  await lockSession(tx, sessionId);
  const [s] = await tx
    .select({
      id: roomSessions.id,
      roomId: roomSessions.roomId,
      status: roomSessions.status,
      rated: roomSessions.rated,
      ratedAt: roomSessions.ratedAt,
      overdue: sql<boolean>`(${roomSessions.endedAt} + make_interval(mins => ${RATING_PENDING_GRACE_MIN}) <= clock_timestamp())`,
    })
    .from(roomSessions)
    .where(eq(roomSessions.id, sessionId))
    .limit(1);
  if (!s) return { applied: false, reason: "no_session" };
  if (s.status !== "finished") return { applied: false, reason: "not_finished" };
  if (!s.rated) return { applied: false, reason: "unrated" };
  if (s.ratedAt !== null) return { applied: false, reason: "already_applied" };
  if (!s.overdue) {
    const [{ pending }] = await tx
      .select({ pending: sql<number>`count(*)::int` })
      .from(submissions)
      .where(
        and(
          eq(submissions.roomSessionId, sessionId),
          eq(submissions.kind, "submit"),
          inArray(submissions.status, ["queued", "running"]),
        ),
      );
    if (pending > 0) return { applied: false, reason: "pending" };
  }
  const claimed = await tx
    .update(roomSessions)
    .set({ ratedAt: sql`clock_timestamp()` })
    .where(
      and(eq(roomSessions.id, sessionId), isNull(roomSessions.ratedAt), eq(roomSessions.status, "finished"), eq(roomSessions.rated, true)),
    )
    .returning({ id: roomSessions.id });
  if (claimed.length === 0) return { applied: false, reason: "already_applied" };

  const slotRows = await tx
    .select({
      position: roomSessionProblems.position,
      problemId: roomSessionProblems.problemId,
      ratingAtStart: roomSessionProblems.ratingAtStart,
      current: problemRatingSql,
      adjust: problems.ratingAdjust,
    })
    .from(roomSessionProblems)
    .innerJoin(problems, eq(problems.id, roomSessionProblems.problemId))
    .where(eq(roomSessionProblems.sessionId, sessionId))
    .orderBy(asc(roomSessionProblems.position));
  const participantRows = await tx
    .select({ userId: roomSessionParticipants.userId, ratingAtStart: roomSessionParticipants.ratingAtStart })
    .from(roomSessionParticipants)
    .where(eq(roomSessionParticipants.sessionId, sessionId))
    .orderBy(asc(roomSessionParticipants.userId));
  const members = await ensureMemberRatings(
    tx,
    s.roomId,
    participantRows.map((p) => p.userId),
  );
  const resultRows = await tx
    .select({
      userId: roomSessionResults.userId,
      position: roomSessionResults.position,
      attempts: roomSessionResults.attempts,
      solved: sql<boolean>`${roomSessionResults.firstAcceptedAt} IS NOT NULL`,
    })
    .from(roomSessionResults)
    .where(eq(roomSessionResults.sessionId, sessionId));

  // People without any rating (left the room before their start snapshot) are not rated.
  const rated = participantRows.flatMap((p) => {
    const rating = p.ratingAtStart ?? members.get(p.userId)?.rating ?? null;
    if (rating === null) return [];
    const mine = resultRows.filter((r) => r.userId === p.userId);
    return [
      {
        userId: p.userId,
        rating,
        ratedPairs: members.get(p.userId)?.ratedPairs ?? 0,
        active: mine.some((r) => r.attempts > 0),
        solved: mine.filter((r) => r.solved && r.attempts > 0).map((r) => String(r.position)),
      },
    ];
  });
  const update = computeSessionRatings({
    problems: slotRows.map((p) => ({ key: String(p.position), rating: p.ratingAtStart ?? Number(p.current) })),
    participants: rated,
  });

  const n = slotRows.length;
  for (const change of update.participants) {
    const startMissing = participantRows.find((p) => p.userId === change.userId)?.ratingAtStart === null;
    await tx
      .update(roomSessionParticipants)
      .set({ ratingDelta: change.delta, ...(startMissing ? { ratingAtStart: change.before } : {}) })
      .where(and(eq(roomSessionParticipants.sessionId, sessionId), eq(roomSessionParticipants.userId, change.userId)));
    if (!change.active || !members.has(change.userId)) continue;
    await tx.execute(sql`
      UPDATE room_members
      SET rating = LEAST(3500, GREATEST(400, coalesce(rating, ${change.before}) + ${change.delta})),
          rating_source = coalesce(rating_source, 'default'::rating_source),
          rated_pairs = rated_pairs + ${n},
          rated_sessions = rated_sessions + 1
      WHERE room_id = ${s.roomId} AND user_id = ${change.userId}
    `);
  }
  const anyActive = update.participants.some((p) => p.active);
  const byProblemId = [...slotRows].sort((a, b) => (a.problemId < b.problemId ? -1 : a.problemId > b.problemId ? 1 : 0));
  for (const slot of byProblemId) {
    const change = update.problems.find((p) => p.key === String(slot.position))!;
    // Raw SQL: a rating drift is not a content edit, so problems.updated_at stays.
    const { rows } = anyActive
      ? await tx.execute<{ rating_adjust: number }>(sql`
          UPDATE problems SET rating_adjust = ${clampAdjust(slot.adjust + change.adjustDelta)}
          WHERE id = ${slot.problemId}
          RETURNING rating_adjust
        `)
      : { rows: [{ rating_adjust: slot.adjust }] };
    const applied = Number(rows[0]?.rating_adjust ?? slot.adjust) - slot.adjust;
    await tx
      .update(roomSessionProblems)
      .set({
        ratingDelta: applied,
        ...(slot.ratingAtStart === null ? { ratingAtStart: Number(slot.current) } : {}),
      })
      .where(and(eq(roomSessionProblems.sessionId, sessionId), eq(roomSessionProblems.position, slot.position)));
  }
  return { applied: true, update };
}

/**
 * Worker backstop (§6.6): finished rated sessions whose ratings are still
 * missing (pending judging at the end, a stale submit swept without
 * finalize). Each in its own transaction; `applySessionRatings` decides.
 */
export async function applyDueSessionRatings(db: Db, limit = 100): Promise<string[]> {
  const due = await db
    .select({ id: roomSessions.id })
    .from(roomSessions)
    .where(and(eq(roomSessions.status, "finished"), eq(roomSessions.rated, true), isNull(roomSessions.ratedAt)))
    .orderBy(asc(roomSessions.endedAt))
    .limit(limit);
  const applied: string[] = [];
  for (const { id } of due) {
    const r = await db.transaction((tx) => applySessionRatings(tx, id));
    if (r.applied) applied.push(id);
  }
  return applied;
}

// --- Reads (D3: members of the room only; callers gate with requireRoomMember) ---

export type MemberRatingView = {
  /** Null until the member's first lobby/session in this room. */
  rating: number | null;
  ratedPairs: number;
  ratedSessions: number;
  provisional: boolean;
  /** Where the starting point came from; never the self-reported number itself. */
  source: RatingSource | null;
};

export function memberRatingView(row: {
  rating: number | null;
  ratedPairs: number;
  ratedSessions: number;
  ratingSource: RatingSource | null;
}): MemberRatingView {
  return {
    rating: row.rating,
    ratedPairs: row.ratedPairs,
    ratedSessions: row.ratedSessions,
    provisional: isProvisional(row.ratedPairs),
    source: row.ratingSource,
  };
}

export type SessionRatingsView = {
  sessionId: string;
  rated: boolean;
  /** "applied" after `rated_at`; "pending" while finished but not applied; "open" before the end. */
  state: "applied" | "pending" | "unrated" | "open";
  ratedAt: string | null;
  participants: {
    userId: string;
    username: string;
    before: number | null;
    delta: number | null;
    after: number | null;
    expected: number | null;
    /** False: "not rated: no submissions". */
    active: boolean;
  }[];
  problems: { position: number; before: number | null; delta: number | null; after: number | null }[];
};

/**
 * Rating ledger of one session (results page data, §11). The caller has
 * checked membership and that the session belongs to the room.
 */
export async function loadSessionRatings(db: Executor, sessionId: string): Promise<SessionRatingsView | null> {
  const [s] = await db
    .select({ id: roomSessions.id, status: roomSessions.status, rated: roomSessions.rated, ratedAt: roomSessions.ratedAt })
    .from(roomSessions)
    .where(eq(roomSessions.id, sessionId))
    .limit(1);
  if (!s) return null;
  const slots = await db
    .select({
      position: roomSessionProblems.position,
      before: roomSessionProblems.ratingAtStart,
      delta: roomSessionProblems.ratingDelta,
    })
    .from(roomSessionProblems)
    .where(eq(roomSessionProblems.sessionId, sessionId))
    .orderBy(asc(roomSessionProblems.position));
  const people = await db
    .select({
      userId: roomSessionParticipants.userId,
      username: users.username,
      before: roomSessionParticipants.ratingAtStart,
      delta: roomSessionParticipants.ratingDelta,
      active: sql<boolean>`EXISTS (SELECT 1 FROM ${roomSessionResults} r
        WHERE r.session_id = ${roomSessionParticipants.sessionId} AND r.user_id = ${roomSessionParticipants.userId} AND r.attempts > 0)`,
    })
    .from(roomSessionParticipants)
    .innerJoin(users, eq(users.id, roomSessionParticipants.userId))
    .where(eq(roomSessionParticipants.sessionId, sessionId))
    .orderBy(asc(users.username));
  const ratings = slots.flatMap((p) => (p.before === null ? [] : [p.before]));
  const complete = ratings.length === slots.length && slots.length > 0;
  const state: SessionRatingsView["state"] =
    s.status !== "finished" ? (s.rated ? "open" : "unrated") : !s.rated ? "unrated" : s.ratedAt ? "applied" : "pending";
  return {
    sessionId: s.id,
    rated: s.rated,
    state,
    ratedAt: s.ratedAt?.toISOString() ?? null,
    participants: people.map((p) => ({
      userId: p.userId,
      username: p.username,
      before: p.before,
      delta: p.delta,
      after: p.before !== null && p.delta !== null ? clampRating(p.before + p.delta) : null,
      expected: p.before !== null && complete ? expectedSolves(p.before, ratings) : null,
      active: p.active,
    })),
    problems: slots.map((p) => ({
      position: p.position,
      before: p.before,
      delta: p.delta,
      after: p.before !== null && p.delta !== null ? p.before + p.delta : null,
    })),
  };
}
