// Inputs and persistence of the lobby draw (docs/specs/rooms.md §2, §6.5
// Q4, Q7, Q8). The selection itself is the pure core in
// src/lib/rooms/selection.ts; this file gathers its inputs, writes the slots
// and builds the lobby view. Callers hold the room and session locks.
import { and, asc, eq, sql } from "drizzle-orm";

import type { Rng } from "@/lib/rooms/rng";
import {
  calibrationFromCounts,
  CHALLENGE_TARGETS,
  classify,
  drawSlots,
  emptyCounts,
  expectedParticipants,
  MAX_REROLLS,
  suggestMix,
  unusedCounts,
  type CandidateProblem,
  type Calibration,
  type DrawError,
  type DrawNotice,
  type Slot,
} from "@/lib/rooms/selection";
import type { ResolvedSettings } from "@/lib/rooms/session-schemas";
import { noticeView, type DrawErrorView, type LobbyView } from "@/lib/rooms/session-view";
import { mixOf, type Difficulty, type Mix } from "@/lib/rooms/types";
import { problems, roomMembers, roomSessionParticipants, roomSessionProblems, roomSessions } from "@/server/db/schema";

import type { RoomSessionRow } from "./access";
import type { Tx } from "./queries";

export type CatalogProblem = CandidateProblem & { slug: string; title: string; tags: string[] };

export type DrawContext = {
  /** Every published problem with usage and solver counts. */
  catalog: CatalogProblem[];
  /** The catalog filtered by the session's topics (any of them). */
  pool: CatalogProblem[];
  expectedCount: number;
  calibration: Calibration;
};

/** Expected participants (§2.1): joined if at least 2, else all current members. */
async function expectedUserIds(tx: Tx, roomId: string, sessionId: string): Promise<string[]> {
  // Sequential: one transaction is one connection (pg rejects overlapping queries).
  const joined = await tx
    .select({ userId: roomSessionParticipants.userId })
    .from(roomSessionParticipants)
    .where(eq(roomSessionParticipants.sessionId, sessionId));
  const members = await tx
    .select({ userId: roomMembers.userId })
    .from(roomMembers)
    .where(eq(roomMembers.roomId, roomId));
  return expectedParticipants(
    joined.map((r) => r.userId),
    members.map((r) => r.userId),
  );
}

/** Q4: (active participant, problem) pairs of the last 6 finished sessions. Also read by the Leaderboard tab (R5). */
export async function loadCalibration(tx: Pick<Tx, "execute">, roomId: string): Promise<Calibration> {
  const { rows } = await tx.execute<{ difficulty: Difficulty; pairs: number; solved: number; sessions: number }>(sql`
    WITH recent AS (
      SELECT id FROM room_sessions
      WHERE room_id = ${roomId} AND status = 'finished'
      ORDER BY started_at DESC
      LIMIT 6
    ), active AS (
      SELECT DISTINCT res.session_id, res.user_id
      FROM room_session_results res JOIN recent ON recent.id = res.session_id
      WHERE res.attempts > 0
    )
    SELECT sp.difficulty, count(*)::int AS pairs, count(res.first_accepted_at)::int AS solved,
           (SELECT count(*)::int FROM recent) AS sessions
    FROM active a
    JOIN room_session_problems sp ON sp.session_id = a.session_id
    LEFT JOIN room_session_results res
      ON res.session_id = a.session_id AND res.user_id = a.user_id AND res.position = sp.position
         AND res.attempts > 0
    GROUP BY sp.difficulty
  `);
  const counts = emptyCounts();
  let sessions = 0;
  for (const r of rows) {
    counts[r.difficulty] = { pairs: Number(r.pairs), solved: Number(r.solved) };
    sessions = Number(r.sessions);
  }
  if (rows.length === 0) {
    const { rows: recent } = await tx.execute<{ n: number }>(sql`
      SELECT count(*)::int AS n FROM (
        SELECT 1 FROM room_sessions WHERE room_id = ${roomId} AND status = 'finished' LIMIT 6
      ) recent
    `);
    sessions = Number(recent[0]?.n ?? 0);
  }
  return calibrationFromCounts(counts, sessions);
}

export async function loadDrawContext(
  tx: Tx,
  session: Pick<RoomSessionRow, "id" | "roomId">,
  tags: readonly string[],
): Promise<DrawContext> {
  const expected = await expectedUserIds(tx, session.roomId, session.id);
  const catalogRows = await tx
    .select({
      id: problems.id,
      slug: problems.slug,
      title: problems.title,
      difficulty: problems.difficulty,
      tags: sql<string[]>`coalesce((
        SELECT array_agg(t.slug ORDER BY t.slug) FROM problem_tags pt JOIN tags t ON t.id = pt.tag_id
        WHERE pt.problem_id = "problems"."id"), '{}')`,
    })
    .from(problems)
    .where(eq(problems.published, true))
    .orderBy(asc(problems.number));
  // Q7: last use of each problem in this room's live/finished sessions.
  const usage = await tx.execute<{ problem_id: string; last_used: Date | string }>(sql`
      SELECT sp.problem_id, max(s.started_at) AS last_used
      FROM room_sessions s JOIN room_session_problems sp ON sp.session_id = s.id
      WHERE s.room_id = ${session.roomId} AND s.status IN ('live', 'finished')
      GROUP BY sp.problem_id
    `);
  // Q8: expected participants with an accepted submit, per problem.
  const solved =
    expected.length === 0
      ? { rows: [] as { problem_id: string; solvers: number }[] }
      : await tx.execute<{ problem_id: string; solvers: number }>(sql`
          SELECT problem_id, count(DISTINCT user_id)::int AS solvers
          FROM submissions
          WHERE user_id IN (${sql.join(
            expected.map((id) => sql`${id}::uuid`),
            sql`, `,
          )}) AND kind = 'submit' AND status = 'accepted'
          GROUP BY problem_id
        `);
  const calibration = await loadCalibration(tx, session.roomId);
  const lastUsed = new Map(usage.rows.map((r) => [r.problem_id, new Date(r.last_used)]));
  const solvers = new Map(solved.rows.map((r) => [r.problem_id, Number(r.solvers)]));
  const catalog: CatalogProblem[] = catalogRows.map((p) => ({
    ...p,
    lastUsedAt: lastUsed.get(p.id) ?? null,
    solvedBy: solvers.get(p.id) ?? 0,
  }));
  const wanted = new Set(tags);
  const pool = wanted.size === 0 ? catalog : catalog.filter((p) => p.tags.some((t) => wanted.has(t)));
  return { catalog, pool, expectedCount: expected.length, calibration };
}

export type SlotRow = Slot & { slug: string; title: string; published: boolean; tags: string[] };

export async function loadSlots(tx: Tx, sessionId: string): Promise<SlotRow[]> {
  return tx
    .select({
      position: roomSessionProblems.position,
      problemId: roomSessionProblems.problemId,
      difficulty: roomSessionProblems.difficulty,
      pinned: roomSessionProblems.pinned,
      slug: problems.slug,
      title: problems.title,
      published: problems.published,
      tags: sql<string[]>`coalesce((
        SELECT array_agg(t.slug ORDER BY t.slug) FROM problem_tags pt JOIN tags t ON t.id = pt.tag_id
        WHERE pt.problem_id = "problems"."id"), '{}')`,
    })
    .from(roomSessionProblems)
    .innerJoin(problems, eq(problems.id, roomSessionProblems.problemId))
    .where(eq(roomSessionProblems.sessionId, sessionId))
    .orderBy(asc(roomSessionProblems.position));
}

/** Replaces the session's slots with `slots` (positions 1..N, one problem each). */
export async function writeSlots(tx: Tx, sessionId: string, slots: readonly Slot[]): Promise<void> {
  await tx.delete(roomSessionProblems).where(eq(roomSessionProblems.sessionId, sessionId));
  if (slots.length === 0) return;
  await tx.insert(roomSessionProblems).values(
    slots.map((s) => ({
      sessionId,
      position: s.position,
      problemId: s.problemId,
      difficulty: s.difficulty,
      pinned: s.pinned,
    })),
  );
}

export type DrawOutcome = { ok: true; notices: DrawNotice[]; mix: Mix } | DrawError;

/**
 * Re-draw (§2.5): keeps pinned slots, draws the rest for the resolved
 * settings (suggested mix recomputed from calibration), then persists slots
 * and settings. On an error nothing is written.
 */
export async function drawAndSave(
  tx: Tx,
  session: RoomSessionRow,
  resolved: ResolvedSettings,
  rng: Rng,
): Promise<DrawOutcome> {
  const ctx = await loadDrawContext(tx, session, resolved.settings.tags);
  const current = await loadSlots(tx, session.id);
  const pinned = current.filter((s) => s.pinned).map(toSlot);
  const pinnedIds = new Set(pinned.map((s) => s.problemId));
  let mix = resolved.settings.mix;
  if (resolved.settings.mixMode === "suggested") {
    const suggestion = suggestMix({
      problemCount: resolved.problemCount,
      rates: ctx.calibration.rates,
      challenge: resolved.settings.challenge,
      available: mixOf(ctx.pool.filter((p) => !pinnedIds.has(p.id))),
      pinned: mixOf(pinned),
    });
    if (!suggestion.ok) return suggestion;
    mix = suggestion.mix;
  }
  const result = drawSlots({
    problemCount: resolved.problemCount,
    mix,
    pool: ctx.pool,
    pinned,
    rerolledIds: session.rerolledProblemIds,
    avoidSolved: resolved.settings.avoidSolved,
    rng,
  });
  if (!result.ok) return result;
  await writeSlots(tx, session.id, result.slots);
  await tx
    .update(roomSessions)
    .set({
      problemCount: resolved.problemCount,
      durationMin: resolved.durationMin,
      plannedFor: resolved.plannedFor,
      settings: { ...resolved.settings, mix },
      rerolledProblemIds: result.rerolledIds,
    })
    .where(eq(roomSessions.id, session.id));
  return { ok: true, notices: result.notices, mix };
}

export function toSlot(s: Slot): Slot {
  return { position: s.position, problemId: s.problemId, difficulty: s.difficulty, pinned: s.pinned };
}

/**
 * The lobby as the viewer may see it. Titles, slugs, draw notes, calibration
 * and pool counts only for the host/owner (§1.2 step 5, §8.4).
 */
export async function buildLobbyView(
  tx: Tx,
  session: RoomSessionRow,
  canManage: boolean,
  extra: { notices?: DrawNotice[]; drawError?: DrawErrorView } = {},
): Promise<LobbyView> {
  const slots = await loadSlots(tx, session.id);
  const base: LobbyView = {
    sessionId: session.id,
    roomId: session.roomId,
    status: session.status,
    hostId: session.hostId,
    canManage,
    problemCount: session.problemCount,
    durationMin: session.durationMin,
    plannedFor: session.plannedFor?.toISOString() ?? null,
    settings: session.settings,
    rerollCount: session.rerollCount,
    rerollsLeft: Math.max(0, MAX_REROLLS - session.rerollCount),
    slots: slots.map((s) => ({ position: s.position, difficulty: s.difficulty, pinned: s.pinned, tags: s.tags })),
    actualMix: mixOf(slots),
    notices: (extra.notices ?? []).map(noticeView),
    ...(extra.drawError ? { drawError: extra.drawError } : {}),
  };
  if (!canManage) return base;

  const ctx = await loadDrawContext(tx, session, session.settings.tags);
  const info = new Map(ctx.catalog.map((p) => [p.id, p]));
  const pinnedIds = new Set(slots.filter((s) => s.pinned).map((s) => s.problemId));
  const suggestion = suggestMix({
    problemCount: session.problemCount,
    rates: ctx.calibration.rates,
    challenge: session.settings.challenge,
    available: mixOf(ctx.pool.filter((p) => !pinnedIds.has(p.id))),
    pinned: mixOf(slots.filter((s) => s.pinned)),
  });
  return {
    ...base,
    slots: slots.map((s, i) => {
      const c = info.get(s.problemId);
      return {
        ...base.slots[i],
        problem: { slug: s.slug, title: s.title, published: s.published },
        note: {
          tier: c ? classify(c) : null,
          solvedBy: c ? c.solvedBy : null,
          expectedCount: ctx.expectedCount,
          lastUsedAt: c?.lastUsedAt?.toISOString() ?? null,
        },
      };
    }),
    calibration: {
      sessions: ctx.calibration.sessions,
      counts: ctx.calibration.counts,
      rates: ctx.calibration.rates,
      target: CHALLENGE_TARGETS[session.settings.challenge],
      suggested: suggestion.ok ? suggestion.mix : null,
      expectedSolved: suggestion.ok ? suggestion.evaluation.expected * session.problemCount : null,
    },
    pool: { available: mixOf(ctx.pool), unused: unusedCounts(ctx.pool) },
  };
}

/** Published problems by slug, for pins (filters ignored: a pin is an explicit choice). */
export async function findPublishedProblem(tx: Tx, slug: string) {
  const [row] = await tx
    .select({ id: problems.id, difficulty: problems.difficulty })
    .from(problems)
    .where(and(eq(problems.slug, slug), eq(problems.published, true)))
    .limit(1);
  return row ?? null;
}

/** Known tag slugs among `slugs` (unknown topics are a 400). */
export async function unknownTags(tx: Tx, slugs: readonly string[]): Promise<string[]> {
  if (slugs.length === 0) return [];
  const { rows } = await tx.execute<{ slug: string }>(
    sql`SELECT slug FROM tags WHERE slug IN (${sql.join(
      slugs.map((s) => sql`${s}`),
      sql`, `,
    )})`,
  );
  const known = new Set(rows.map((r) => r.slug));
  return slugs.filter((s) => !known.has(s));
}
