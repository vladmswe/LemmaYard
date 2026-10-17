// Session scoring at finalize time (docs/specs/rooms.md §3.4). Called by
// `finalize()` in worker/queue.ts inside the transaction that wrote the
// verdict, so the verdict, the results row, the participant totals and the
// event commit together. Results are recomputed from `submissions` (the source
// of truth) every time, which makes out-of-order judging and repeated calls
// harmless.
import { and, asc, eq, lt, notInArray, sql } from "drizzle-orm";

import { computeCellOutcome, isCountedStatus, scoreSession } from "@/lib/rooms/scoring";
import {
  roomSessionParticipants,
  roomSessionProblems,
  roomSessionResults,
  roomSessions,
  submissions,
  users,
} from "@/server/db/schema";

import { appendRoomEvent, lockSession } from "./events";
import type { Tx } from "./queries";

export type OutcomeInput = {
  sessionId: string;
  userId: string;
  problemId: string;
  /** The submission that was just finalized. */
  submissionId: string;
};

export type OutcomeResult =
  | { applied: false; reason: "no_session" | "not_started" | "not_in_session" | "not_participant" }
  | { applied: true; event: "problem_solved" | "attempt_failed" | null };

/** End of the counting window: ends_at, or the earlier ended_at of an early end. */
export function countingEnd(session: { endsAt: Date; endedAt: Date | null }): Date {
  return session.endedAt && session.endedAt < session.endsAt ? session.endedAt : session.endsAt;
}

export async function applySessionOutcome(tx: Tx, input: OutcomeInput): Promise<OutcomeResult> {
  // 1. Serialize with every other writer of this session's events.
  await lockSession(tx, input.sessionId);

  // 2. Session window and the problem's slot.
  const [session] = await tx
    .select({
      startedAt: roomSessions.startedAt,
      endsAt: roomSessions.endsAt,
      endedAt: roomSessions.endedAt,
      position: roomSessionProblems.position,
    })
    .from(roomSessions)
    .leftJoin(
      roomSessionProblems,
      and(eq(roomSessionProblems.sessionId, roomSessions.id), eq(roomSessionProblems.problemId, input.problemId)),
    )
    .where(eq(roomSessions.id, input.sessionId))
    .limit(1);
  if (!session) return { applied: false, reason: "no_session" };
  if (!session.startedAt || !session.endsAt) return { applied: false, reason: "not_started" };
  if (session.position === null) return { applied: false, reason: "not_in_session" };
  const position = session.position;

  const [participant] = await tx
    .select({ userId: roomSessionParticipants.userId })
    .from(roomSessionParticipants)
    .where(
      and(eq(roomSessionParticipants.sessionId, input.sessionId), eq(roomSessionParticipants.userId, input.userId)),
    )
    .limit(1);
  if (!participant) return { applied: false, reason: "not_participant" };

  // 3. Recompute the cell from the source of truth (Q9).
  const rows = await tx
    .select({ id: submissions.id, status: submissions.status, createdAt: submissions.createdAt })
    .from(submissions)
    .where(
      and(
        eq(submissions.roomSessionId, input.sessionId),
        eq(submissions.userId, input.userId),
        eq(submissions.problemId, input.problemId),
        eq(submissions.kind, "submit"),
        notInArray(submissions.status, ["queued", "running"]),
      ),
    )
    .orderBy(asc(submissions.createdAt), asc(submissions.id));
  const window = { startedAt: session.startedAt, endsAt: countingEnd({ endsAt: session.endsAt, endedAt: session.endedAt }) };
  const outcome = computeCellOutcome(rows, window);
  const current = rows.find((r) => r.id === input.submissionId);
  const currentCounted =
    current !== undefined &&
    isCountedStatus(current.status) &&
    current.createdAt >= window.startedAt &&
    current.createdAt < window.endsAt;

  // 4. Previous cell, then upsert (no row for a cell with only ignored submits).
  const [previous] = await tx
    .select({ firstAcceptedAt: roomSessionResults.firstAcceptedAt })
    .from(roomSessionResults)
    .where(
      and(
        eq(roomSessionResults.sessionId, input.sessionId),
        eq(roomSessionResults.userId, input.userId),
        eq(roomSessionResults.position, position),
      ),
    )
    .limit(1);
  if (!previous && outcome.attempts === 0) return { applied: true, event: null };

  const [{ solvedBefore }] = await tx
    .select({ solvedBefore: sql<boolean>`count(*) > 0` })
    .from(submissions)
    .where(
      and(
        eq(submissions.userId, input.userId),
        eq(submissions.problemId, input.problemId),
        eq(submissions.kind, "submit"),
        eq(submissions.status, "accepted"),
        lt(submissions.createdAt, session.startedAt),
      ),
    );
  const values = {
    attempts: outcome.attempts,
    wrongBeforeAccept: outcome.wrongBefore,
    firstAcceptedAt: outcome.firstAcceptedAt,
    firstAcceptedSubmissionId: outcome.firstAcceptedSubmissionId,
    solveSeconds: outcome.solveSeconds,
    solvedBefore,
    updatedAt: sql`now()`,
  };
  await tx
    .insert(roomSessionResults)
    .values({ sessionId: input.sessionId, userId: input.userId, position, ...values })
    .onConflictDoUpdate({
      target: [roomSessionResults.sessionId, roomSessionResults.userId, roomSessionResults.position],
      set: values,
    });

  // 5. Totals and ranks of the whole session (≤ 20 participants).
  const totals = await recomputeSessionScores(tx, input.sessionId);

  // 6. Events.
  const wasSolved = previous?.firstAcceptedAt != null;
  if (!wasSolved && outcome.firstAcceptedAt !== null && outcome.solveSeconds !== null) {
    const [earlier] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(roomSessionResults)
      .where(
        and(
          eq(roomSessionResults.sessionId, input.sessionId),
          eq(roomSessionResults.position, position),
          sql`${roomSessionResults.userId} <> ${input.userId}`,
          lt(roomSessionResults.firstAcceptedAt, outcome.firstAcceptedAt),
        ),
      );
    const appended = await appendRoomEvent(tx, input.sessionId, {
      type: "problem_solved",
      actorUserId: input.userId,
      payload: {
        position,
        solveSeconds: outcome.solveSeconds,
        wrongBefore: outcome.wrongBefore,
        firstSolver: earlier.n === 0,
        solvedCount: Math.max(1, totals.get(input.userId)?.solvedCount ?? 1),
      },
    });
    return { applied: true, event: appended ? "problem_solved" : null };
  }
  if (currentCounted && current.status !== "accepted" && outcome.firstAcceptedAt === null) {
    await appendRoomEvent(tx, input.sessionId, {
      type: "attempt_failed",
      actorUserId: input.userId,
      payload: { position, attempts: outcome.attempts },
    });
    return { applied: true, event: "attempt_failed" };
  }
  return { applied: true, event: null };
}

/**
 * Recomputes solved count, penalty and rank of every participant from the
 * results rows (Q11) and writes the rows that changed. Idempotent. The caller
 * holds the session lock.
 */
export async function recomputeSessionScores(
  tx: Tx,
  sessionId: string,
): Promise<Map<string, { solvedCount: number; penaltySec: number; rank: number }>> {
  const [participants, results] = await Promise.all([
    tx
      .select({
        userId: roomSessionParticipants.userId,
        username: users.username,
        solvedCount: roomSessionParticipants.solvedCount,
        penaltySec: roomSessionParticipants.penaltySec,
        rank: roomSessionParticipants.rank,
      })
      .from(roomSessionParticipants)
      .innerJoin(users, eq(users.id, roomSessionParticipants.userId))
      .where(eq(roomSessionParticipants.sessionId, sessionId)),
    tx
      .select({
        userId: roomSessionResults.userId,
        position: roomSessionResults.position,
        wrongBefore: roomSessionResults.wrongBeforeAccept,
        solveSeconds: roomSessionResults.solveSeconds,
      })
      .from(roomSessionResults)
      .where(eq(roomSessionResults.sessionId, sessionId)),
  ]);
  const score = scoreSession(
    participants.map((p) => ({
      userId: p.userId,
      username: p.username,
      cells: results.filter((r) => r.userId === p.userId),
    })),
  );
  const before = new Map(participants.map((p) => [p.userId, p]));
  const changed = score.participants.filter((p) => {
    const old = before.get(p.userId)!;
    return old.solvedCount !== p.solvedCount || old.penaltySec !== p.penaltySec || old.rank !== p.rank;
  });
  if (changed.length > 0) {
    const values = sql.join(
      changed.map((p) => sql`(${p.userId}::uuid, ${p.solvedCount}::int, ${p.penaltySec}::int, ${p.rank}::int)`),
      sql`, `,
    );
    await tx.execute(sql`
      UPDATE room_session_participants AS p
      SET solved_count = v.solved, penalty_sec = v.penalty, rank = v.rank
      FROM (VALUES ${values}) AS v(user_id, solved, penalty, rank)
      WHERE p.session_id = ${sessionId} AND p.user_id = v.user_id
    `);
  }
  return new Map(score.participants.map((p) => [p.userId, p]));
}
