// Inputs and persistence of the lobby draw (docs/specs/rooms.md §2, §6.5
// Q4, Q7, Q8; Rooms v2 §6.3, §7). The selection itself is the pure core in
// src/lib/rooms/selection.ts (difficulty mode) and src/lib/rooms/rating.ts
// (rating mode); this file gathers their inputs, writes the slots and builds
// the lobby view. Callers hold the room and session locks.
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import {
  drawSlotsByRating,
  isProvisional,
  ratingExpectation,
  ratingTargets,
  solveProbability,
  type RatedCandidate,
  type RatedSlot,
} from "@/lib/rooms/rating";
import type { Rng } from "@/lib/rooms/rng";
import {
  calibrationFromCounts,
  CHALLENGE_TARGETS,
  classify,
  drawSlots,
  emptyCounts,
  expectedParticipants,
  MAX_REROLLS,
  placePinnedSlots,
  suggestMix,
  unusedCounts,
  type Calibration,
  type DrawError,
  type DrawNotice,
  type Slot,
} from "@/lib/rooms/selection";
import type { ResolvedSettings } from "@/lib/rooms/session-schemas";
import {
  noticeView,
  type DrawErrorView,
  type LobbyExpectationView,
  type LobbySlotView,
  type LobbyView,
} from "@/lib/rooms/session-view";
import {
  externalCountOf,
  mixOf,
  selectionModeOf,
  type Difficulty,
  type Mix,
  type RoomSessionSettings,
} from "@/lib/rooms/types";
import {
  problems,
  roomMembers,
  roomSessionParticipants,
  roomSessionProblems,
  roomSessions,
  users,
} from "@/server/db/schema";

import { getLeetCodeCatalog, slotProvenance } from "@/server/leetcode/catalog";

import type { RoomSessionRow } from "./access";
import { isAutoSlot, planLeetCode, writeLeetCodePlan, type LeetCodePlan } from "./leetcode";
import type { Tx } from "./queries";
import { ensureMemberRatings, problemRatingSql } from "./ratings";

export type CatalogProblem = RatedCandidate & { slug: string; title: string; tags: string[] };

export type DrawContext = {
  /** Every published problem with usage and solver counts. */
  catalog: CatalogProblem[];
  /** The catalog filtered by the session's topics (any of them). */
  pool: CatalogProblem[];
  expectedCount: number;
  /** Expected participants (§2.1): joined if at least 2, else all current members. */
  expectedUserIds: string[];
  calibration: Calibration;
};

/** Expected participants (§2.1): joined if at least 2, else all current members. */
export async function expectedUserIds(tx: Tx, roomId: string, sessionId: string): Promise<string[]> {
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
      -- Judged problems only: LeetCode slots (problem_id NULL) are self-reported and never calibrate.
      SELECT DISTINCT res.session_id, res.user_id
      FROM room_session_results res JOIN recent ON recent.id = res.session_id
      JOIN room_session_problems sp0
        ON sp0.session_id = res.session_id AND sp0.position = res.position AND sp0.problem_id IS NOT NULL
      WHERE res.attempts > 0
    )
    SELECT sp.difficulty, count(*)::int AS pairs, count(res.first_accepted_at)::int AS solved,
           (SELECT count(*)::int FROM recent) AS sessions
    FROM active a
    JOIN room_session_problems sp ON sp.session_id = a.session_id AND sp.problem_id IS NOT NULL
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
      rating: problemRatingSql,
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
      WHERE s.room_id = ${session.roomId} AND s.status IN ('live', 'finished') AND sp.problem_id IS NOT NULL
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
    rating: Number(p.rating),
    lastUsedAt: lastUsed.get(p.id) ?? null,
    solvedBy: solvers.get(p.id) ?? 0,
  }));
  const wanted = new Set(tags);
  const pool = wanted.size === 0 ? catalog : catalog.filter((p) => p.tags.some((t) => wanted.has(t)));
  return { catalog, pool, expectedCount: expected.length, expectedUserIds: expected, calibration };
}

export type SlotRow = Slot & { slug: string; title: string; published: boolean; tags: string[]; rating: number };

/** The session's slots with one of OUR problems (LeetCode slots: `loadExternalSlots`). */
export async function loadSlots(tx: Tx, sessionId: string): Promise<SlotRow[]> {
  const rows = await tx
    .select({
      position: roomSessionProblems.position,
      problemId: roomSessionProblems.problemId,
      difficulty: roomSessionProblems.difficulty,
      pinned: roomSessionProblems.pinned,
      slug: problems.slug,
      title: problems.title,
      published: problems.published,
      rating: problemRatingSql,
      tags: sql<string[]>`coalesce((
        SELECT array_agg(t.slug ORDER BY t.slug) FROM problem_tags pt JOIN tags t ON t.id = pt.tag_id
        WHERE pt.problem_id = "problems"."id"), '{}')`,
    })
    .from(roomSessionProblems)
    .innerJoin(problems, eq(problems.id, roomSessionProblems.problemId))
    .where(and(eq(roomSessionProblems.sessionId, sessionId), isNotNull(roomSessionProblems.problemId)))
    .orderBy(asc(roomSessionProblems.position));
  // Inner join on problem_id: an internal slot always has both (CHECK room_session_problems_kind).
  return rows.map((r) => ({ ...r, problemId: r.problemId!, difficulty: r.difficulty!, rating: Number(r.rating) }));
}

/** A LeetCode slot of a session (rooms-external-problems §1.2): the snapshot taken when it was filled. */
export type ExternalSlotRow = {
  position: number;
  slug: string;
  title: string;
  difficulty: Difficulty | null;
  rating: number | null;
  bankId: string | null;
  /** Picked by hand (room list, pasted link, catalog search); false = auto-picked by the draw. */
  pinned: boolean;
};

export async function loadExternalSlots(tx: Pick<Tx, "select">, sessionId: string): Promise<ExternalSlotRow[]> {
  const rows = await tx
    .select({
      position: roomSessionProblems.position,
      slug: roomSessionProblems.externalSlug,
      title: roomSessionProblems.externalTitle,
      difficulty: roomSessionProblems.difficulty,
      rating: roomSessionProblems.externalRating,
      bankId: roomSessionProblems.externalProblemId,
      pinned: roomSessionProblems.pinned,
    })
    .from(roomSessionProblems)
    .where(and(eq(roomSessionProblems.sessionId, sessionId), isNull(roomSessionProblems.problemId)))
    .orderBy(asc(roomSessionProblems.position));
  // CHECK room_session_problems_kind: a row without problem_id has a slug and a title.
  return rows.map((r) => ({ ...r, slug: r.slug!, title: r.title! }));
}

/** Row values of a LeetCode slot. */
export function externalSlotValues(sessionId: string, position: number, e: Omit<ExternalSlotRow, "position">) {
  return {
    sessionId,
    position,
    problemId: null,
    difficulty: e.difficulty,
    pinned: e.pinned,
    externalProblemId: e.bankId,
    externalSlug: e.slug,
    externalTitle: e.title,
    externalRating: e.rating,
  };
}

/**
 * Keeps the first `keep` LeetCode slots (in position order) and moves them
 * right after the drawn ones: positions `drawn + 1 …`. Extra LeetCode slots
 * beyond `keep` are dropped. Runs before the internal slots are rewritten.
 */
export async function placeExternalSlots(tx: Tx, sessionId: string, drawn: number, keep: number): Promise<void> {
  const externals = await loadExternalSlots(tx, sessionId);
  const kept = externals.slice(0, keep);
  const unchanged = kept.length === externals.length && kept.every((e, i) => e.position === drawn + 1 + i);
  if (unchanged) return;
  await tx
    .delete(roomSessionProblems)
    .where(and(eq(roomSessionProblems.sessionId, sessionId), isNull(roomSessionProblems.problemId)));
  // Internal rows may still sit at these positions: clear them, the caller rewrites them next.
  if (kept.length > 0) {
    await tx
      .delete(roomSessionProblems)
      .where(and(eq(roomSessionProblems.sessionId, sessionId), sql`${roomSessionProblems.position} > ${drawn}`));
    await tx.insert(roomSessionProblems).values(kept.map((e, i) => externalSlotValues(sessionId, drawn + 1 + i, e)));
  }
}

/**
 * Replaces the session's internal slots with `slots` (positions 1..N − E,
 * one problem each). LeetCode slots sit after them and are left alone.
 */
export async function writeSlots(tx: Tx, sessionId: string, slots: readonly Slot[]): Promise<void> {
  await tx
    .delete(roomSessionProblems)
    .where(and(eq(roomSessionProblems.sessionId, sessionId), isNotNull(roomSessionProblems.problemId)));
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

async function saveDraw(
  tx: Tx,
  session: RoomSessionRow,
  resolved: ResolvedSettings,
  slots: readonly Slot[],
  settingsIn: RoomSessionSettings,
  rerolledIds: readonly string[],
  lc: LeetCodePlan = { kind: "skip" },
): Promise<void> {
  // LeetCode slots first: they move to the end of the new count (the internal positions are rewritten next).
  const external = externalCountOf(settingsIn);
  const drawn = resolved.problemCount - external;
  let settings = settingsIn;
  if (lc.kind === "plan") {
    const lcTargets = await writeLeetCodePlan(tx, session.id, drawn, lc);
    settings = { ...settings, leetcodeRerolled: lc.rerolled };
    if (settings.leetcodeRerolled?.length === 0) delete settings.leetcodeRerolled;
    if (selectionModeOf(settings) === "rating") {
      settings.targets = lcTargets.map((t, i) => (i < drawn ? (settingsIn.targets?.[i] ?? null) : t));
    }
  } else {
    await placeExternalSlots(tx, session.id, drawn, external);
  }
  await writeSlots(tx, session.id, slots);
  await tx
    .update(roomSessions)
    .set({
      problemCount: resolved.problemCount,
      durationMin: resolved.durationMin,
      plannedFor: resolved.plannedFor,
      settings,
      rated: resolved.rated,
      rerolledProblemIds: [...rerolledIds],
    })
    .where(eq(roomSessions.id, session.id));
}

/** Room ratings of the expected participants, initialised on first need (v2 §6.4). */
export async function expectedRatings(
  tx: Tx,
  roomId: string,
  userIds: readonly string[],
): Promise<{ userId: string; rating: number; ratedPairs: number }[]> {
  const ratings = await ensureMemberRatings(tx, roomId, userIds);
  return [...ratings.values()].map((r) => ({ userId: r.userId, rating: r.rating, ratedPairs: r.ratedPairs }));
}

function settingsWithoutTargets(settings: RoomSessionSettings): RoomSessionSettings {
  const { targets: _targets, ...rest } = settings;
  void _targets;
  return rest;
}

/** Settings a non-host member may see before the start: no targets, no re-rolled LeetCode slugs. */
export function settingsForMember(settings: RoomSessionSettings): RoomSessionSettings {
  const { leetcodeRerolled: _rerolled, ...rest } = settingsWithoutTargets(settings);
  void _rerolled;
  return rest;
}

/**
 * Rating-mode draw (v2 §6.3) with persistence: keeps pinned slots, sets
 * ladder targets from the expected participants' room ratings and fills the
 * free slots near them. On an error nothing is written. The lobby view
 * (`buildLobbyView`) then carries the rating numbers.
 */
export async function drawByRating(
  tx: Tx,
  session: RoomSessionRow,
  resolved: ResolvedSettings,
  rng: Rng,
  ctx?: DrawContext,
): Promise<DrawOutcome> {
  const context = ctx ?? (await loadDrawContext(tx, session, resolved.settings.tags));
  const current = await loadSlots(tx, session.id);
  const pinned: RatedSlot[] = current.filter((s) => s.pinned).map((s) => ({ ...toSlot(s), rating: s.rating }));
  const drawn = drawnCount(resolved);
  if (drawn === 0) return saveWithoutDraw(tx, session, resolved, pinned, context, rng);
  const people = await expectedRatings(tx, session.roomId, context.expectedUserIds);
  const result = drawSlotsByRating({
    problemCount: drawn,
    pool: context.pool,
    pinned,
    rerolledIds: session.rerolledProblemIds,
    avoidSolved: resolved.settings.avoidSolved,
    rng,
    ratings: people.map((p) => p.rating),
    challenge: resolved.settings.challenge,
  });
  if (!result.ok) return result;
  // LeetCode slots after the internal draw (same RNG, so the internal picks never change).
  const lc = await planLeetCode(tx, session, resolved, rng, context);
  if ("ok" in lc) return lc;
  const mix = mixOf(result.slots);
  await saveDraw(
    tx,
    session,
    resolved,
    result.slots.map(toSlot),
    { ...resolved.settings, mode: "rating", mix, targets: result.targetsByPosition },
    result.rerolledIds,
    lc,
  );
  return { ok: true, notices: [...result.notices, ...(lc.kind === "plan" ? lc.notices : [])], mix };
}

/**
 * Re-draw (§2.5): keeps pinned slots, draws the rest for the resolved
 * settings and mode, then persists slots and settings. On an error nothing
 * is written. Difficulty mode = v1 (suggested mix recomputed from
 * calibration); manual mode keeps only the pinned slots (the host fills the
 * rest by search).
 */
export async function drawAndSave(
  tx: Tx,
  session: RoomSessionRow,
  resolved: ResolvedSettings,
  rng: Rng,
): Promise<DrawOutcome> {
  const mode = selectionModeOf(resolved.settings);
  const ctx = await loadDrawContext(tx, session, resolved.settings.tags);
  if (mode === "rating") return drawByRating(tx, session, resolved, rng, ctx);

  const current = await loadSlots(tx, session.id);
  const pinned = current.filter((s) => s.pinned).map(toSlot);
  const drawn = drawnCount(resolved);
  if (drawn === 0) return saveWithoutDraw(tx, session, resolved, pinned, ctx, rng);
  if (mode === "manual") {
    if (pinned.length > drawn) {
      return { ok: false, code: "too_many_pinned", counts: mixOf([...ctx.pool, ...pinned]) };
    }
    const placed = placePinnedSlots(pinned, drawn).pinned;
    const mix = mixOf(placed);
    await saveDraw(tx, session, resolved, placed, { ...settingsWithoutTargets(resolved.settings), mix }, session.rerolledProblemIds);
    return { ok: true, notices: [], mix };
  }

  const pinnedIds = new Set(pinned.map((s) => s.problemId));
  let mix = resolved.settings.mix;
  if (resolved.settings.mixMode === "suggested") {
    const suggestion = suggestMix({
      problemCount: drawn,
      rates: ctx.calibration.rates,
      challenge: resolved.settings.challenge,
      available: mixOf(ctx.pool.filter((p) => !pinnedIds.has(p.id))),
      pinned: mixOf(pinned),
    });
    if (!suggestion.ok) return suggestion;
    mix = suggestion.mix;
  }
  const result = drawSlots({
    problemCount: drawn,
    mix,
    pool: ctx.pool,
    pinned,
    rerolledIds: session.rerolledProblemIds,
    avoidSolved: resolved.settings.avoidSolved,
    rng,
  });
  if (!result.ok) return result;
  const lc = await planLeetCode(tx, session, resolved, rng, ctx);
  if ("ok" in lc) return lc;
  await saveDraw(tx, session, resolved, result.slots, { ...settingsWithoutTargets(resolved.settings), mix }, result.rerolledIds, lc);
  return { ok: true, notices: [...result.notices, ...(lc.kind === "plan" ? lc.notices : [])], mix };
}

/** Slots the draw fills: all of them minus the LeetCode slots at the end. */
export function drawnCount(resolved: Pick<ResolvedSettings, "problemCount" | "settings">): number {
  return Math.max(0, resolved.problemCount - externalCountOf(resolved.settings));
}

/** Only LeetCode slots (nothing to draw): pinned problems would not fit, so they must go first. */
async function saveWithoutDraw(
  tx: Tx,
  session: RoomSessionRow,
  resolved: ResolvedSettings,
  pinned: readonly Slot[],
  ctx: DrawContext,
  rng: Rng,
): Promise<DrawOutcome> {
  if (pinned.length > 0) return { ok: false, code: "too_many_pinned", counts: mixOf([...ctx.pool, ...pinned]) };
  const lc = await planLeetCode(tx, session, resolved, rng, ctx);
  if ("ok" in lc) return lc;
  const mix = { easy: 0, medium: 0, hard: 0 };
  await saveDraw(tx, session, resolved, [], { ...settingsWithoutTargets(resolved.settings), mix }, session.rerolledProblemIds, lc);
  return { ok: true, notices: lc.kind === "plan" ? lc.notices : [], mix };
}

export function toSlot(s: Slot): Slot {
  return { position: s.position, problemId: s.problemId, difficulty: s.difficulty, pinned: s.pinned };
}

/** Rating-mode numbers of the lobby (v2 §6.3 "Shown"). */
async function ratingLobbyParts(
  tx: Tx,
  session: RoomSessionRow,
  slots: readonly SlotRow[],
  expectedUserIds: readonly string[],
): Promise<{
  slotRatings: Map<number, { chance: number; rating: number; target: number | null }>;
  expected: LobbyExpectationView;
}> {
  const people = await expectedRatings(tx, session.roomId, expectedUserIds);
  const names =
    people.length === 0
      ? []
      : await tx
          .select({ id: users.id, username: users.username })
          .from(users)
          .where(inArray(users.id, people.map((p) => p.userId)));
  const nameOf = new Map(names.map((n) => [n.id, n.username]));
  const exp = ratingExpectation({
    people,
    slots: slots.map((s) => ({ position: s.position, rating: s.rating })),
    challenge: session.settings.challenge,
  });
  const targets = session.settings.targets ?? [];
  const slotRatings = new Map(
    exp.slots.map((s) => [
      s.position,
      { chance: s.chance, rating: s.rating, target: slots.find((x) => x.position === s.position)?.pinned ? null : (targets[s.position - 1] ?? null) },
    ]),
  );
  const ratings = people.map((p) => p.rating);
  const freeCount = slots.filter((s) => !s.pinned).length;
  const plan =
    ratings.length > 0 && freeCount > 0
      ? ratingTargets({
          ratings,
          freeCount,
          pinnedRatings: slots.filter((s) => s.pinned).map((s) => s.rating),
          challenge: session.settings.challenge,
        })
      : null;
  return {
    slotRatings,
    expected: {
      target: exp.target,
      expectedPerPerson: exp.room.expectedPerPerson,
      share: exp.room.share,
      perUser: exp.perUser
        .map((u) => ({
          userId: u.userId,
          username: nameOf.get(u.userId) ?? "",
          rating: u.rating,
          provisional: isProvisional(people.find((p) => p.userId === u.userId)?.ratedPairs ?? 0),
          expected: u.expected,
        }))
        .sort((a, b) => b.rating - a.rating || a.username.localeCompare(b.username)),
      center: plan ? Math.round(plan.center) : null,
      widened: plan?.widened ?? false,
      ratingRange: ratings.length > 0 ? { min: Math.min(...ratings), max: Math.max(...ratings) } : null,
    },
  };
}

/**
 * The lobby as the viewer may see it. Titles, slugs, draw notes, calibration,
 * pool counts, problem ratings and per-person expectations only for the
 * host/owner (§1.2 step 5, §8.4; v2 §2.3, AC-V2-SEL-4). In rating mode every
 * viewer gets each slot's room solve chance.
 */
export async function buildLobbyView(
  tx: Tx,
  session: RoomSessionRow,
  canManage: boolean,
  extra: { notices?: DrawNotice[]; drawError?: DrawErrorView } = {},
): Promise<LobbyView> {
  const slots = await loadSlots(tx, session.id);
  const externals = await loadExternalSlots(tx, session.id);
  const mode = selectionModeOf(session.settings);
  const drawn = drawnCount(session);
  // LeetCode slots (always last): the host sees what they are; everyone else
  // only that a LeetCode problem is there, never its title, slug or rating
  // before the start (AC-V2-SEL-4, rooms-external-problems §4).
  const catalog = canManage ? getLeetCodeCatalog() : null;
  const externalViews: LobbySlotView[] = externals.map((e) => {
    if (!canManage) return { position: e.position, difficulty: e.difficulty, pinned: false, tags: [], external: {} };
    const entry = catalog?.bySlug.get(e.slug);
    const provenance = slotProvenance(e);
    return {
      position: e.position,
      difficulty: e.difficulty,
      pinned: false,
      tags: [],
      external: {
        slug: e.slug,
        title: e.title,
        rating: e.rating,
        bankId: e.bankId,
        auto: isAutoSlot(e),
        ...(entry ? { n: entry.n } : {}),
        ...(provenance && entry ? { tags: entry.tags, provenance } : {}),
      },
    };
  });
  const base: LobbyView = {
    sessionId: session.id,
    roomId: session.roomId,
    status: session.status,
    hostId: session.hostId,
    canManage,
    problemCount: session.problemCount,
    durationMin: session.durationMin,
    plannedFor: session.plannedFor?.toISOString() ?? null,
    // Slot targets sit next to the drawn problems' ratings, re-rolled LeetCode slugs name
    // candidates: host/owner only (AC-V2-SEL-4, AC-LC-11).
    settings: canManage ? session.settings : settingsForMember(session.settings),
    rerollCount: session.rerollCount,
    rerollsLeft: Math.max(0, MAX_REROLLS - session.rerollCount),
    slots: slots.map((s) => ({ position: s.position, difficulty: s.difficulty, pinned: s.pinned, tags: s.tags })),
    actualMix: mixOf(slots),
    notices: (extra.notices ?? []).map(noticeView),
    ...(extra.drawError ? { drawError: extra.drawError } : {}),
    mode,
    rated: session.rated,
  };
  const needsContext = canManage || (mode === "rating" && slots.length > 0);
  if (!needsContext) return { ...base, slots: [...base.slots, ...externalViews] };

  const ctx = await loadDrawContext(tx, session, session.settings.tags);
  const rating = mode === "rating" && slots.length > 0 ? await ratingLobbyParts(tx, session, slots, ctx.expectedUserIds) : null;
  if (!canManage) {
    // Non-hosts: the solve chance only, never the rating, title or slug.
    return {
      ...base,
      slots: [
        ...base.slots.map((s) => {
          const r = rating?.slotRatings.get(s.position);
          return r ? { ...s, rating: { chance: r.chance } } : s;
        }),
        ...externalViews,
      ],
    };
  }

  const info = new Map(ctx.catalog.map((p) => [p.id, p]));
  const pinnedIds = new Set(slots.filter((s) => s.pinned).map((s) => s.problemId));
  const suggestion = suggestMix({
    problemCount: Math.max(1, drawn),
    rates: ctx.calibration.rates,
    challenge: session.settings.challenge,
    available: mixOf(ctx.pool.filter((p) => !pinnedIds.has(p.id))),
    pinned: mixOf(slots.filter((s) => s.pinned)),
  });
  const internalViews: LobbySlotView[] = slots.map((s, i) => {
      const c = info.get(s.problemId);
      const r = rating?.slotRatings.get(s.position);
      return {
        ...base.slots[i],
        problem: { slug: s.slug, title: s.title, published: s.published },
        note: {
          tier: c ? classify(c) : null,
          solvedBy: c ? c.solvedBy : null,
          expectedCount: ctx.expectedCount,
          lastUsedAt: c?.lastUsedAt?.toISOString() ?? null,
        },
        ...(r
          ? {
              rating: {
                chance: r.chance,
                rating: r.rating,
                target: r.target,
                deviation: r.target === null ? null : r.rating - r.target,
              },
            }
          : {}),
      };
    });
  // Host/owner: LeetCode slots with a rating get the room solve chance and (auto, rating mode) their target.
  const lcPeople =
    mode === "rating" && externalViews.some((v) => v.external?.rating != null)
      ? await expectedRatings(tx, session.roomId, ctx.expectedUserIds)
      : [];
  const lcViews = externalViews.map((v) => {
    const r = v.external?.rating;
    if (r == null || lcPeople.length === 0) return v;
    const chance = lcPeople.reduce((sum, p) => sum + solveProbability(p.rating, r), 0) / lcPeople.length;
    const target = v.external?.auto ? (session.settings.targets?.[v.position - 1] ?? null) : null;
    return { ...v, rating: { chance, rating: r, target, deviation: target === null ? null : r - target } };
  });
  return {
    ...base,
    slots: [...internalViews, ...lcViews],
    ...(catalog ? { leetcodeCatalog: { problems: catalog.visible.length } } : {}),
    calibration: {
      sessions: ctx.calibration.sessions,
      counts: ctx.calibration.counts,
      rates: ctx.calibration.rates,
      target: CHALLENGE_TARGETS[session.settings.challenge],
      suggested: suggestion.ok && drawn > 0 ? suggestion.mix : null,
      expectedSolved: suggestion.ok && drawn > 0 ? suggestion.evaluation.expected * drawn : null,
    },
    pool: { available: mixOf(ctx.pool), unused: unusedCounts(ctx.pool) },
    ...(rating ? { expected: rating.expected } : {}),
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
