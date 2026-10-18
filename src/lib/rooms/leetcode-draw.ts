// Auto-pick of LeetCode problems for a session's LeetCode slots
// (docs/specs/leetcode-integration.md §5, §6.6). Pure and deterministic given
// the injected RNG, like the rest of the draw: the server gathers catalog
// entries with their usage in the room, this module picks, the server writes.
//
// LeetCode slots get their OWN ladder (rating mode) or their own suggested mix
// (difficulty mode), computed for the auto slots only, so the room's problems
// and their targets are unchanged. Candidates reuse the room draw's tiers
// (A unused and unsolved, B solved by some expected participants, C used in
// this room before), so repeat avoidance and "avoid solved" work unchanged.
// A candidate's id inside these calls is "lc:<slug>".
import { drawSlotsByRating, rerollSlotByRating, type RatedCandidate, type RatedSlot } from "./rating";
import type { Rng } from "./rng";
import { drawSlots, rerollSlot, suggestMix, type DrawNotice, type Slot } from "./selection";
import {
  MAX_LEETCODE_REROLLED,
  MAX_PROBLEM_COUNT,
  mixOf,
  type Challenge,
  type Difficulty,
  type Mix,
} from "./types";

export const LC_ID_PREFIX = "lc:";

export function leetcodeId(slug: string): string {
  return `${LC_ID_PREFIX}${slug}`;
}

export function slugOfLeetcodeId(id: string): string {
  return id.startsWith(LC_ID_PREFIX) ? id.slice(LC_ID_PREFIX.length) : id;
}

/** A catalog problem as the draw sees it (premium and excluded ones never get here). */
export type LeetCodeCandidate = {
  slug: string;
  difficulty: Difficulty | null;
  rating: number | null;
  tags: readonly string[];
  /** Last start of a live/finished session of this room with this slug; null = never. */
  lastUsedAt: Date | null;
  /** Expected participants with a self-reported solve of this slug in this room. */
  solvedBy: number;
};

/** A LeetCode slot that stays (picked by hand, or auto but not being re-picked). */
export type FixedLeetCodeSlot = { slug: string; difficulty: Difficulty | null; rating: number | null };

export type LeetCodePick = { slug: string; difficulty: Difficulty; rating: number | null; target: number | null };

export type LeetCodeDrawResult =
  | { ok: true; picks: LeetCodePick[]; rerolled: string[]; notices: DrawNotice[] }
  | { ok: false; code: "leetcode_pool_too_small"; counts: Mix };

type Mode = "rating" | "difficulty";

function toRated(c: LeetCodeCandidate): RatedCandidate {
  return {
    id: leetcodeId(c.slug),
    difficulty: c.difficulty!,
    rating: c.rating ?? 0,
    lastUsedAt: c.lastUsedAt,
    solvedBy: c.solvedBy,
  };
}

/** Problems usable in this mode: a rating for the ladder, a difficulty for the mix. */
export function eligible(candidates: readonly LeetCodeCandidate[], mode: Mode): LeetCodeCandidate[] {
  return candidates.filter((c) => c.difficulty !== null && (mode === "difficulty" || c.rating !== null));
}

/**
 * Topic filter with fallback: candidates tagged with any session topic, unless
 * fewer than `needed` are, in which case the topics are ignored (notice).
 */
export function filterByTopics(
  pool: readonly LeetCodeCandidate[],
  tags: readonly string[],
  needed: number,
): { pool: LeetCodeCandidate[]; ignored: boolean } {
  if (tags.length === 0) return { pool: [...pool], ignored: false };
  const wanted = new Set(tags);
  const matching = pool.filter((c) => c.tags.some((t) => wanted.has(t)));
  return matching.length >= needed ? { pool: matching, ignored: false } : { pool: [...pool], ignored: true };
}

/** The last MAX_LEETCODE_REROLLED re-rolled slugs, oldest dropped first. */
export function capRerolled(slugs: readonly string[]): string[] {
  const unique = [...new Set(slugs)];
  return unique.slice(Math.max(0, unique.length - MAX_LEETCODE_REROLLED));
}

/**
 * Picks `count` LeetCode problems. Fixed slots (pinned ones) stay; their
 * rating (rating mode) or difficulty (difficulty mode) takes part in the
 * ladder or mix. Picks come back in slot order: ascending targets in rating
 * mode (warm-up first), Easy → Medium → Hard in difficulty mode.
 */
export function drawLeetCodeSlots(input: {
  mode: Mode;
  count: number;
  /** Visible catalog problems minus the slugs already in the session. */
  candidates: readonly LeetCodeCandidate[];
  fixed: readonly FixedLeetCodeSlot[];
  tags: readonly string[];
  rerolled: readonly string[];
  avoidSolved: boolean;
  rng: Rng;
  /** Rating mode: room ratings of the expected participants. */
  ratings: readonly number[];
  challenge: Challenge;
  /** Difficulty mode: the room's calibrated solve rates. */
  rates: Readonly<Record<Difficulty, number>>;
}): LeetCodeDrawResult {
  if (input.count <= 0) return { ok: true, picks: [], rerolled: capRerolled(input.rerolled), notices: [] };
  const fixedSlugs = new Set(input.fixed.map((f) => f.slug));
  const base = eligible(input.candidates, input.mode).filter((c) => !fixedSlugs.has(c.slug));
  const { pool, ignored } = filterByTopics(base, input.tags, input.count);
  const notices: DrawNotice[] = ignored ? [{ code: "leetcode_topics_ignored" }] : [];
  if (pool.length < input.count) return { ok: false, code: "leetcode_pool_too_small", counts: mixOf(pool.map(toRated)) };
  const rerolledIds = input.rerolled.map(leetcodeId);

  if (input.mode === "rating") {
    // Fixed slots with a rating sit in front so the ladder accounts for them.
    const fixed = input.fixed.filter((f) => f.rating !== null && f.difficulty !== null).slice(0, MAX_PROBLEM_COUNT - input.count);
    const pinned: RatedSlot[] = fixed.map((f, i) => ({
      position: i + 1,
      problemId: leetcodeId(f.slug),
      difficulty: f.difficulty!,
      pinned: true,
      rating: f.rating!,
    }));
    const result = drawSlotsByRating({
      problemCount: pinned.length + input.count,
      pool: pool.map(toRated),
      pinned,
      rerolledIds,
      avoidSolved: input.avoidSolved,
      rng: input.rng,
      ratings: input.ratings,
      challenge: input.challenge,
    });
    if (!result.ok) return { ok: false, code: "leetcode_pool_too_small", counts: result.counts };
    const bySlug = new Map(pool.map((c) => [c.slug, c]));
    const picks = result.slots
      .filter((s) => !s.pinned)
      .map((s) => {
        const c = bySlug.get(slugOfLeetcodeId(s.problemId))!;
        return { slug: c.slug, difficulty: c.difficulty!, rating: c.rating, target: s.target };
      });
    return {
      ok: true,
      picks,
      rerolled: capRerolled(result.rerolledIds.map(slugOfLeetcodeId)),
      notices: [...notices, ...result.notices.filter((n) => n.code !== "targets_far")],
    };
  }

  const fixed = input.fixed.filter((f) => f.difficulty !== null).slice(0, MAX_PROBLEM_COUNT - input.count);
  const pinned: Slot[] = fixed.map((f, i) => ({ position: i + 1, problemId: leetcodeId(f.slug), difficulty: f.difficulty!, pinned: true }));
  const problemCount = pinned.length + input.count;
  const candidates = pool.map(toRated);
  const suggestion = suggestMix({
    problemCount,
    rates: input.rates,
    challenge: input.challenge,
    available: mixOf(candidates),
    pinned: mixOf(pinned),
  });
  if (!suggestion.ok) return { ok: false, code: "leetcode_pool_too_small", counts: suggestion.counts };
  const result = drawSlots({
    problemCount,
    mix: suggestion.mix,
    pool: candidates,
    pinned,
    rerolledIds,
    avoidSolved: input.avoidSolved,
    rng: input.rng,
  });
  if (!result.ok) return { ok: false, code: "leetcode_pool_too_small", counts: result.counts };
  const bySlug = new Map(pool.map((c) => [c.slug, c]));
  // drawSlots fills free positions Easy → Medium → Hard, so position order is that order.
  const picks = result.slots
    .filter((s) => !s.pinned)
    .map((s) => {
      const c = bySlug.get(slugOfLeetcodeId(s.problemId))!;
      return { slug: c.slug, difficulty: c.difficulty!, rating: c.rating, target: null };
    });
  return { ok: true, picks, rerolled: capRerolled(result.rerolledIds.map(slugOfLeetcodeId)), notices: [...notices, ...result.notices] };
}

export type LeetCodeRerollResult =
  | { ok: true; pick: LeetCodePick; rerolled: string[]; notices: DrawNotice[] }
  | { ok: false; code: "no_candidates" | "reroll_limit" };

/**
 * Re-roll one auto LeetCode slot: rating mode searches around the slot's
 * target, difficulty mode keeps its difficulty; the current problem joins the
 * re-rolled list. Every other slug of the session is excluded.
 */
export function rerollLeetCodeSlot(input: {
  mode: Mode;
  slot: FixedLeetCodeSlot;
  target: number | null;
  /** Visible catalog problems minus the OTHER slugs of the session. */
  candidates: readonly LeetCodeCandidate[];
  tags: readonly string[];
  rerolled: readonly string[];
  rerollCount: number;
  avoidSolved: boolean;
  rng: Rng;
}): LeetCodeRerollResult {
  const current = input.slot;
  const base = eligible(input.candidates, input.mode).filter((c) => c.slug !== current.slug);
  const { pool, ignored } = filterByTopics(
    input.mode === "difficulty" ? base.filter((c) => c.difficulty === current.difficulty) : base,
    input.tags,
    1,
  );
  const self: RatedCandidate = {
    id: leetcodeId(current.slug),
    difficulty: current.difficulty ?? "medium",
    rating: current.rating ?? input.target ?? 0,
    lastUsedAt: null,
    solvedBy: 0,
  };
  const slot: RatedSlot = { position: 1, problemId: self.id, difficulty: self.difficulty, pinned: false, rating: self.rating };
  const common = {
    slots: [slot],
    position: 1,
    pool: [self, ...pool.map(toRated)],
    rerolledIds: input.rerolled.map(leetcodeId),
    rerollCount: input.rerollCount,
    avoidSolved: input.avoidSolved,
    rng: input.rng,
  };
  const result =
    input.mode === "rating" ? rerollSlotByRating({ ...common, target: input.target }) : rerollSlot(common);
  if (!result.ok) return { ok: false, code: result.code === "reroll_limit" ? "reroll_limit" : "no_candidates" };
  const chosen = result.slots[0];
  const c = pool.find((p) => leetcodeId(p.slug) === chosen.problemId);
  if (!c) return { ok: false, code: "no_candidates" };
  return {
    ok: true,
    pick: { slug: c.slug, difficulty: c.difficulty!, rating: c.rating, target: input.mode === "rating" ? (input.target ?? current.rating) : null },
    rerolled: capRerolled(result.rerolledIds.map(slugOfLeetcodeId)),
    notices: [
      ...(ignored ? [{ code: "leetcode_topics_ignored" } as const] : []),
      ...result.notices.filter((n) => n.code !== "targets_far"),
    ],
  };
}
