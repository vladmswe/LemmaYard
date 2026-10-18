// LeetCode auto-pick in the lobby (docs/specs/leetcode-integration.md §5,
// §6.6): candidates from the committed catalog with their usage in the room,
// the plan for the session's LeetCode slots, and writing it. Nothing here
// talks to leetcode.com; the catalog is bundled server-side.
//
// A LeetCode slot is AUTO when the draw picked it (`pinned = false` and no
// room-list entry); slots picked by hand (room list, pasted link, catalog
// search) are written with `pinned = true` and never re-picked.
import { and, eq, isNull, sql } from "drizzle-orm";

import {
  drawLeetCodeSlots,
  type FixedLeetCodeSlot,
  type LeetCodeCandidate,
  type LeetCodePick,
} from "@/lib/rooms/leetcode-draw";
import type { Rng } from "@/lib/rooms/rng";
import type { DrawError, DrawNotice } from "@/lib/rooms/selection";
import type { ResolvedSettings } from "@/lib/rooms/session-schemas";
import { externalCountOf, leetcodeAutoOf, selectionModeOf } from "@/lib/rooms/types";
import { roomSessionProblems } from "@/server/db/schema";
import { getLeetCodeCatalog, type LeetCodeCatalog } from "@/server/leetcode/catalog";

import type { RoomSessionRow } from "./access";
import { expectedRatings, externalSlotValues, loadExternalSlots, type DrawContext, type ExternalSlotRow } from "./draw";
import type { Tx } from "./queries";

export const CATALOG_UNAVAILABLE = "Automatic LeetCode problems are not available right now. Pick them yourself instead.";

/** Picked by the draw (re-rollable); everything else was picked by hand. */
export function isAutoSlot(e: Pick<ExternalSlotRow, "pinned" | "bankId">): boolean {
  return !e.pinned && e.bankId === null;
}

/** Visible catalog problems with their use and self-reported solves in this room. */
export async function loadLeetCodeCandidates(
  tx: Tx,
  catalog: LeetCodeCatalog,
  roomId: string,
  expectedUserIds: readonly string[],
): Promise<LeetCodeCandidate[]> {
  const usage = await tx.execute<{ slug: string; last_used: Date | string }>(sql`
    SELECT sp.external_slug AS slug, max(s.started_at) AS last_used
    FROM room_sessions s JOIN room_session_problems sp ON sp.session_id = s.id
    WHERE s.room_id = ${roomId} AND s.status IN ('live', 'finished') AND sp.external_slug IS NOT NULL
    GROUP BY sp.external_slug
  `);
  const solved =
    expectedUserIds.length === 0
      ? { rows: [] as { slug: string; solvers: number }[] }
      : await tx.execute<{ slug: string; solvers: number }>(sql`
          SELECT sp.external_slug AS slug, count(DISTINCT r.user_id)::int AS solvers
          FROM room_session_results r
          JOIN room_sessions s ON s.id = r.session_id AND s.room_id = ${roomId}
          JOIN room_session_problems sp
            ON sp.session_id = r.session_id AND sp.position = r.position AND sp.external_slug IS NOT NULL
          WHERE r.first_accepted_at IS NOT NULL AND r.user_id IN (${sql.join(
            expectedUserIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})
          GROUP BY sp.external_slug
        `);
  const lastUsed = new Map(usage.rows.map((r) => [r.slug, new Date(r.last_used)]));
  const solvers = new Map(solved.rows.map((r) => [r.slug, Number(r.solvers)]));
  return catalog.visible.map((p) => ({
    slug: p.slug,
    difficulty: p.difficulty,
    rating: p.rating,
    tags: p.tags,
    lastUsedAt: lastUsed.get(p.slug) ?? null,
    solvedBy: solvers.get(p.slug) ?? 0,
  }));
}

export type LeetCodePlan =
  | { kind: "skip" }
  | {
      kind: "plan";
      /** Slots that stay (picked by hand), in their old order. */
      fixed: ExternalSlotRow[];
      picks: LeetCodePick[];
      rerolled: string[];
      notices: DrawNotice[];
    };

/**
 * What the draw does with the LeetCode slots: nothing (auto-pick off, manual
 * mode, catalog unavailable) or keep the hand-picked ones and pick the rest.
 * Reads only, so a failure leaves the transaction without writes.
 * `extraRerolled`: slugs to avoid as well (re-roll all adds the current picks).
 */
export async function planLeetCode(
  tx: Tx,
  session: Pick<RoomSessionRow, "id" | "roomId">,
  resolved: Pick<ResolvedSettings, "settings">,
  rng: Rng,
  ctx: Pick<DrawContext, "expectedUserIds" | "calibration">,
  extraRerolled: readonly string[] = [],
): Promise<LeetCodePlan | DrawError> {
  const settings = resolved.settings;
  const external = externalCountOf(settings);
  const mode = selectionModeOf(settings);
  const catalog = getLeetCodeCatalog();
  if (!leetcodeAutoOf(settings) || external === 0 || mode === "manual" || !catalog) return { kind: "skip" };
  const externals = await loadExternalSlots(tx, session.id);
  const fixed = externals.filter((e) => !isAutoSlot(e)).slice(0, external);
  const count = external - fixed.length;
  if (count === 0) return { kind: "plan", fixed, picks: [], rerolled: [...(settings.leetcodeRerolled ?? [])], notices: [] };
  const fixedSlugs = new Set(fixed.map((f) => f.slug));
  const candidates = (await loadLeetCodeCandidates(tx, catalog, session.roomId, ctx.expectedUserIds)).filter(
    (c) => !fixedSlugs.has(c.slug),
  );
  const ratings = mode === "rating" ? (await expectedRatings(tx, session.roomId, ctx.expectedUserIds)).map((p) => p.rating) : [];
  const result = drawLeetCodeSlots({
    mode,
    count,
    candidates,
    fixed: fixed.map((f): FixedLeetCodeSlot => ({ slug: f.slug, difficulty: f.difficulty, rating: f.rating })),
    tags: settings.tags,
    rerolled: [...(settings.leetcodeRerolled ?? []), ...extraRerolled],
    avoidSolved: settings.avoidSolved,
    rng,
    ratings,
    challenge: settings.challenge,
    rates: ctx.calibration.rates,
  });
  if (!result.ok) return { ok: false, code: result.code, counts: result.counts };
  return { kind: "plan", fixed, picks: result.picks, rerolled: result.rerolled, notices: result.notices };
}

/** Snapshot values of a catalog pick (title and rating as in the catalog). */
export function pickSnapshot(catalog: LeetCodeCatalog, pick: Pick<LeetCodePick, "slug">): Omit<ExternalSlotRow, "position"> {
  const p = catalog.bySlug.get(pick.slug)!;
  return { slug: p.slug, title: p.title, difficulty: p.difficulty, rating: p.rating, bankId: null, pinned: false };
}

/**
 * Writes the LeetCode slots of a plan at positions `drawn + 1 …`: the kept
 * ones first in their old order, then the picks. Returns the target per
 * position (index = position − 1) for the picks, null elsewhere.
 */
export async function writeLeetCodePlan(
  tx: Tx,
  sessionId: string,
  drawn: number,
  plan: Extract<LeetCodePlan, { kind: "plan" }>,
): Promise<(number | null)[]> {
  const catalog = getLeetCodeCatalog();
  await tx
    .delete(roomSessionProblems)
    .where(and(eq(roomSessionProblems.sessionId, sessionId), isNull(roomSessionProblems.problemId)));
  // Internal rows may still sit at these positions (count lowered): the caller rewrites them next.
  await tx
    .delete(roomSessionProblems)
    .where(and(eq(roomSessionProblems.sessionId, sessionId), sql`${roomSessionProblems.position} > ${drawn}`));
  const rows = [
    ...plan.fixed.map((f) => ({ ...f })),
    ...(catalog ? plan.picks.map((p) => pickSnapshot(catalog, p)) : []),
  ].map((r, i) => externalSlotValues(sessionId, drawn + 1 + i, r));
  if (rows.length > 0) await tx.insert(roomSessionProblems).values(rows);
  const targets: (number | null)[] = Array.from({ length: drawn + rows.length }, () => null);
  plan.picks.forEach((p, i) => {
    targets[drawn + plan.fixed.length + i] = p.target;
  });
  return targets;
}
