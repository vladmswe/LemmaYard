// Rating core of Rooms v2 (docs/specs/rooms-v2.md §6, §7; owner decision D2:
// ratings are PER ROOM, so every number here is a member's rating inside one
// room). Pure and deterministic given the injected RNG: no DB or server
// imports, so the lobby UI can reuse it.
//
// Model: every (participant, problem) pair of a rated session is an Elo
// match. P(solve) = 1 / (1 + 10^((R_p − R_u) / 400)). People move by
// k·(S − E) with k = K / max(N, 4); problems drift slowly (4 per surprise,
// clamped to ±200 around the author's rating).
import type { Rng } from "./rng";
import {
  MAX_REROLLS,
  pickCandidate,
  placePinnedSlots,
  type CandidateProblem,
  type DrawError,
  type DrawNotice,
  type DrawnSlot,
  type Slot,
  type SlotError,
  classify,
} from "./selection";
import { MAX_PROBLEM_COUNT, MIN_PROBLEM_COUNT, mixOf, type Challenge, type Difficulty, type RatingSource } from "./types";

// --- Constants (§6.2–§6.4). Judgement calls of the spec, kept in one place. ---

/** Logistic scale: a 400-point gap is 10:1 odds. */
export const ELO_SCALE = 400;
/** K while established (≥ 8 rated pairs in this room) and while provisional. */
export const K_ESTABLISHED = 96;
export const K_PROVISIONAL = 160;
/** A member is provisional in a room until this many rated (person, problem) pairs. */
export const PROVISIONAL_PAIRS = 8;
/** k = K / max(N, K_DIVISOR_MIN): 1–3 problem sessions move people at most K/4 per problem. */
export const K_DIVISOR_MIN = 4;
/** Problem drift per unit of surprise, and its clamp around the author's rating. */
export const PROBLEM_K = 4;
export const PROBLEM_ADJUST_CAP = 200;
/** Stored rating range (`room_members_rating_range` CHECK). */
export const RATING_MIN = 400;
export const RATING_MAX = 3500;

/** Cold start (§6.4). */
export const DEFAULT_RATING = 1500;
export const SELF_REPORTED_CLAMP = [1000, 2600] as const;
export const PRACTICE_CLAMP = [1000, 1800] as const;
export const PRACTICE_MIN_SOLVED = 3;
export const PRACTICE_TOP = 3;
export const PRACTICE_OFFSET = -100;

/** Problems without an author rating (§6.4). */
export const BAND_DEFAULT_RATING: Readonly<Record<Difficulty, number>> = {
  easy: 1200,
  medium: 1600,
  hard: 2000,
};

/** Target share solved per person in rating mode (§6.3; difficulty mode keeps 65/50/35). */
export const RATING_CHALLENGE_TARGETS: Readonly<Record<Challenge, number>> = {
  relaxed: 0.75,
  balanced: 0.55,
  tough: 0.35,
};

/** Ladder width (§6.3): w = min(400, 100·(N − 1)), widened to the rating spread up to 800. */
export const LADDER_STEP = 100;
export const LADDER_MAX = 400;
export const LADDER_SPREAD_MAX = 800;
/** Bisection for the ladder center. */
export const CENTER_RANGE = [800, 3000] as const;
export const BISECTION_STEPS = 60;
/** Candidate bands around a slot target, tried in order; beyond the last one the closest problem wins (E3). */
export const TARGET_BANDS = [100, 200, 300] as const;
export const TARGETS_FAR = 300;

// --- Small helpers ---

export function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/**
 * Rounds half away from zero, so +x and −x round symmetrically (Math.round
 * would turn −2.5 into −2 but 2.5 into 3).
 */
export function roundHalfAway(x: number): number {
  const r = Math.round(Math.abs(x));
  return x < 0 && r !== 0 ? -r : r;
}

/** P(person with rating `ru` solves a problem rated `rp`). */
export function solveProbability(ru: number, rp: number): number {
  return 1 / (1 + 10 ** ((rp - ru) / ELO_SCALE));
}

/** Expected solves E_u = Σ_j P(R_u, R_pj). */
export function expectedSolves(ru: number, problemRatings: readonly number[]): number {
  let e = 0;
  for (const rp of problemRatings) e += solveProbability(ru, rp);
  return e;
}

/** Effective problem rating R_p = (author rating or band default) + adjust. */
export function problemRating(p: { difficulty: Difficulty; authorRating: number | null; ratingAdjust: number }): number {
  return (p.authorRating ?? BAND_DEFAULT_RATING[p.difficulty]) + p.ratingAdjust;
}

export function isProvisional(ratedPairs: number): boolean {
  return ratedPairs < PROVISIONAL_PAIRS;
}

/** k_u = K_u / max(N, 4). */
export function kFactor(ratedPairs: number, problemCount: number): number {
  const K = isProvisional(ratedPairs) ? K_PROVISIONAL : K_ESTABLISHED;
  return K / Math.max(problemCount, K_DIVISOR_MIN);
}

export function clampRating(r: number): number {
  return clamp(Math.round(r), RATING_MIN, RATING_MAX);
}

export function clampAdjust(adjust: number): number {
  return clamp(Math.round(adjust), -PROBLEM_ADJUST_CAP, PROBLEM_ADJUST_CAP);
}

// --- Cold start (§6.4, per room) ---

export type StartingRating = { rating: number; source: RatingSource };

/**
 * A member's first rating in a room. Precedence: the self-reported LeetCode
 * contest rating (clamped 1000–2600) → the mean of their 3 highest-rated
 * solved practice problems − 100 (clamped 1000–1800; needs ≥ 3 solved) → 1500.
 */
export function startingRating(input: {
  selfReported: number | null;
  /** Effective ratings of the distinct problems they solved outside sessions. */
  practiceSolved: readonly number[];
}): StartingRating {
  if (input.selfReported !== null) {
    return { rating: clamp(Math.round(input.selfReported), ...SELF_REPORTED_CLAMP), source: "self_reported" };
  }
  if (input.practiceSolved.length >= PRACTICE_MIN_SOLVED) {
    const top = [...input.practiceSolved].sort((a, b) => b - a).slice(0, PRACTICE_TOP);
    const mean = top.reduce((a, b) => a + b, 0) / top.length;
    return { rating: clamp(Math.round(mean + PRACTICE_OFFSET), ...PRACTICE_CLAMP), source: "practice" };
  }
  return { rating: DEFAULT_RATING, source: "default" };
}

// --- Session update (§6.2) ---

export type RatingParticipantInput = {
  userId: string;
  /** Room rating at session start. */
  rating: number;
  /** Rated pairs in this room before this session (provisional K below 8). */
  ratedPairs: number;
  /** At least one counted session submit; inactive people are not rated. */
  active: boolean;
  /** Keys of the problems they solved inside the session window. */
  solved: readonly string[];
};

export type RatingProblemInput = {
  /** Any stable key (the server uses the slot position). */
  key: string;
  /** Effective rating at session start. */
  rating: number;
};

export type ParticipantRatingChange = {
  userId: string;
  active: boolean;
  before: number;
  /** E_u (also for inactive people, for display). */
  expected: number;
  /** S_u */
  solved: number;
  k: number;
  /** 0 for inactive participants. */
  delta: number;
  after: number;
  provisional: boolean;
};

export type ProblemRatingChange = {
  key: string;
  before: number;
  /** Σ_u (s_up − P(R_u, R_p)) over active participants. */
  surprise: number;
  /** round(−4 · surprise), before clamping the stored adjust. */
  adjustDelta: number;
};

export type SessionRatingUpdate = {
  problemCount: number;
  participants: ParticipantRatingChange[];
  problems: ProblemRatingChange[];
};

/**
 * Rating changes of one finished rated session. Every P uses the ratings at
 * start. Order of the output follows the input (callers sort for locking).
 */
export function computeSessionRatings(input: {
  problems: readonly RatingProblemInput[];
  participants: readonly RatingParticipantInput[];
}): SessionRatingUpdate {
  const n = input.problems.length;
  const ratings = input.problems.map((p) => p.rating);
  const surprise = new Map(input.problems.map((p) => [p.key, 0]));
  const participants = input.participants.map((u): ParticipantRatingChange => {
    const solvedKeys = new Set(u.solved.filter((key) => surprise.has(key)));
    const expected = expectedSolves(u.rating, ratings);
    const k = kFactor(u.ratedPairs, Math.max(n, 1));
    const provisional = isProvisional(u.ratedPairs);
    if (!u.active || n === 0) {
      return { userId: u.userId, active: false, before: u.rating, expected, solved: solvedKeys.size, k, delta: 0, after: u.rating, provisional };
    }
    for (const p of input.problems) {
      const s = solvedKeys.has(p.key) ? 1 : 0;
      surprise.set(p.key, surprise.get(p.key)! + s - solveProbability(u.rating, p.rating));
    }
    const delta = roundHalfAway(k * (solvedKeys.size - expected));
    return {
      userId: u.userId,
      active: true,
      before: u.rating,
      expected,
      solved: solvedKeys.size,
      k,
      delta,
      after: clampRating(u.rating + delta),
      provisional,
    };
  });
  const problems = input.problems.map((p): ProblemRatingChange => {
    const s = surprise.get(p.key)!;
    return { key: p.key, before: p.rating, surprise: s, adjustDelta: roundHalfAway(-PROBLEM_K * s) };
  });
  return { problemCount: n, participants, problems };
}

// --- Selection by rating (§6.3) ---

/**
 * Ladder offsets for `n` free slots, ascending: `w·((i − 1)/(n − 1) − ½)`
 * with w = min(400, 100·(n − 1)), widened to the rating spread (≤ 800).
 */
export function ladderOffsets(n: number, ratings: readonly number[]): { offsets: number[]; width: number; widened: boolean } {
  if (n <= 0) return { offsets: [], width: 0, widened: false };
  if (n === 1) return { offsets: [0], width: 0, widened: false };
  const base = Math.min(LADDER_MAX, LADDER_STEP * (n - 1));
  const spread = ratings.length > 0 ? Math.max(...ratings) - Math.min(...ratings) : 0;
  const width = Math.min(LADDER_SPREAD_MAX, Math.max(base, spread));
  return {
    offsets: Array.from({ length: n }, (_, i) => width * (i / (n - 1) - 0.5)),
    width,
    widened: width > base,
  };
}

/** Closed-form center for intuition: c₀ = R̄ + 400·log10(1/τ − 1). */
export function closedFormCenter(ratings: readonly number[], tau: number): number {
  const mean = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  return mean + ELO_SCALE * Math.log10(1 / tau - 1);
}

/** mean over people and slots of P: free slots at c + offset, pinned at their own rating. */
export function meanSolveChance(
  ratings: readonly number[],
  center: number,
  offsets: readonly number[],
  pinnedRatings: readonly number[] = [],
): number {
  const slots = offsets.length + pinnedRatings.length;
  if (ratings.length === 0 || slots === 0) return 0;
  let sum = 0;
  for (const ru of ratings) {
    for (const o of offsets) sum += solveProbability(ru, center + o);
    for (const rp of pinnedRatings) sum += solveProbability(ru, rp);
  }
  return sum / (ratings.length * slots);
}

/**
 * Bisection for the ladder center c in [800, 3000] so that the mean solve
 * chance equals τ. The mean falls as c rises; an unreachable τ (pins) ends
 * at the range boundary.
 */
export function solveCenter(input: {
  ratings: readonly number[];
  offsets: readonly number[];
  pinnedRatings?: readonly number[];
  tau: number;
}): number {
  let [lo, hi] = CENTER_RANGE as readonly [number, number];
  for (let step = 0; step < BISECTION_STEPS; step++) {
    const mid = (lo + hi) / 2;
    if (meanSolveChance(input.ratings, mid, input.offsets, input.pinnedRatings) > input.tau) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export type RatingTargets = {
  tau: number;
  /** Bisection result (unrounded). */
  center: number;
  offsets: number[];
  width: number;
  /** The ladder was widened because the room's ratings are spread out. */
  widened: boolean;
  /** Rounded slot targets, ascending (one per free slot). */
  targets: number[];
};

/** Targets for `freeCount` slots given the people's room ratings and the pinned problems' ratings. */
export function ratingTargets(input: {
  ratings: readonly number[];
  freeCount: number;
  pinnedRatings?: readonly number[];
  challenge?: Challenge;
  /** Overrides `challenge`. */
  tau?: number;
}): RatingTargets {
  const ratings = input.ratings.length > 0 ? input.ratings : [DEFAULT_RATING];
  const tau = input.tau ?? RATING_CHALLENGE_TARGETS[input.challenge ?? "balanced"];
  const { offsets, width, widened } = ladderOffsets(input.freeCount, ratings);
  const center = solveCenter({ ratings, offsets, pinnedRatings: input.pinnedRatings, tau });
  return { tau, center, offsets, width, widened, targets: offsets.map((o) => Math.round(center + o)) };
}

export type RatedCandidate = CandidateProblem & { rating: number };
export type RatedSlot = Slot & { rating: number };
export type RatingDrawnSlot = DrawnSlot & {
  rating: number;
  /** Null for pinned slots (they keep their own rating). */
  target: number | null;
};

/**
 * One slot's pick: the first band (±100, ±200, ±300) around the target that
 * has candidates wins, and inside it the v1 tier order decides (A unused and
 * unsolved, B solved by fewer people first, C oldest use first) with a
 * uniform pick among equals. Nothing within 300 → the closest rating.
 */
export function pickForTarget(
  candidates: readonly RatedCandidate[],
  target: number,
  avoidSolved: boolean,
  rng: Rng,
): RatedCandidate {
  if (candidates.length === 0) throw new Error("pickForTarget: no candidates");
  for (const band of TARGET_BANDS) {
    const inBand = candidates.filter((c) => Math.abs(c.rating - target) <= band);
    if (inBand.length > 0) return pickCandidate(inBand, avoidSolved, rng) as RatedCandidate;
  }
  const best = Math.min(...candidates.map((c) => Math.abs(c.rating - target)));
  const closest = candidates.filter((c) => Math.abs(c.rating - target) === best);
  return pickCandidate(closest, avoidSolved, rng) as RatedCandidate;
}

function toRatingDrawnSlot(slot: Slot, info: CandidateProblem | undefined, rating: number, target: number | null): RatingDrawnSlot {
  return {
    ...slot,
    tier: info ? classify(info) : null,
    solvedBy: info ? info.solvedBy : null,
    lastUsedAt: info ? info.lastUsedAt : null,
    rating,
    target,
  };
}

export type RatingDrawResult =
  | {
      ok: true;
      slots: RatingDrawnSlot[];
      rerolledIds: string[];
      notices: DrawNotice[];
      plan: RatingTargets;
      /** Target per position (index = position − 1); null for pinned slots. */
      targetsByPosition: (number | null)[];
    }
  | DrawError;

function assertCount(n: number): void {
  if (!Number.isInteger(n) || n < MIN_PROBLEM_COUNT || n > MAX_PROBLEM_COUNT) {
    throw new RangeError(`problem count must be an integer in 1..8, got ${n}`);
  }
}

/**
 * Rating-mode draw (§6.3). Pinned slots stay (their real rating enters the
 * mean); the free positions get ladder targets in ascending order, so
 * Problem 1 is the warm-up. Same result shape as `drawSlots` plus the plan.
 * Errors: `pool_too_small`, `too_many_pinned` (no `mix_infeasible`: any
 * difficulty may fill a slot).
 */
export function drawSlotsByRating(input: {
  problemCount: number;
  /** Published problems matching the topic filter, with usage info and effective rating. */
  pool: readonly RatedCandidate[];
  pinned?: readonly RatedSlot[];
  rerolledIds?: readonly string[];
  avoidSolved: boolean;
  rng: Rng;
  /** Room ratings of the expected participants. */
  ratings: readonly number[];
  challenge?: Challenge;
  tau?: number;
}): RatingDrawResult {
  assertCount(input.problemCount);
  const n = input.problemCount;
  const pinnedIn = [...(input.pinned ?? [])].sort((a, b) => a.position - b.position);
  if (new Set(pinnedIn.map((s) => s.problemId)).size !== pinnedIn.length) {
    throw new Error("drawSlotsByRating: duplicate pinned problem");
  }
  const pinnedIds = new Set(pinnedIn.map((s) => s.problemId));
  const pool = input.pool.filter((c) => !pinnedIds.has(c.id));
  const counts = { ...mixOf([...pool, ...pinnedIn]) };
  if (pinnedIn.length > n) return { ok: false, code: "too_many_pinned", counts };
  if (pool.length + pinnedIn.length < n) return { ok: false, code: "pool_too_small", counts };

  const { pinned, freePositions } = placePinnedSlots(pinnedIn, n);
  const plan = ratingTargets({
    ratings: input.ratings,
    freeCount: freePositions.length,
    pinnedRatings: pinned.map((s) => s.rating),
    challenge: input.challenge,
    tau: input.tau,
  });

  const info = new Map(input.pool.map((c) => [c.id, c]));
  const used = new Set(pinnedIds);
  const rerolled = new Set(input.rerolledIds ?? []);
  const notices: DrawNotice[] = [];
  const slots: RatingDrawnSlot[] = pinned.map((s) =>
    toRatingDrawnSlot({ position: s.position, problemId: s.problemId, difficulty: s.difficulty, pinned: true }, info.get(s.problemId), s.rating, null),
  );
  const targetsByPosition: (number | null)[] = Array.from({ length: n }, () => null);
  freePositions.forEach((position, i) => {
    const target = plan.targets[i];
    targetsByPosition[position - 1] = target;
    const remaining = pool.filter((c) => !used.has(c.id));
    let candidates = remaining.filter((c) => !rerolled.has(c.id));
    let reset = false;
    if (candidates.length === 0) {
      for (const c of remaining) rerolled.delete(c.id);
      candidates = remaining;
      reset = true;
    }
    const chosen = pickForTarget(candidates, target, input.avoidSolved, input.rng);
    if (reset) notices.push({ code: "rerolls_reset", difficulty: chosen.difficulty });
    if (Math.abs(chosen.rating - target) > TARGETS_FAR) {
      notices.push({ code: "targets_far", difficulty: chosen.difficulty, position, rating: chosen.rating, target });
    }
    used.add(chosen.id);
    slots.push(
      toRatingDrawnSlot({ position, problemId: chosen.id, difficulty: chosen.difficulty, pinned: false }, chosen, chosen.rating, target),
    );
  });
  slots.sort((a, b) => a.position - b.position);
  return { ok: true, slots, rerolledIds: [...rerolled], notices, plan, targetsByPosition };
}

export type RatingRerollResult =
  | {
      ok: true;
      slots: RatingDrawnSlot[];
      rerolledIds: string[];
      rerollCount: number;
      notices: DrawNotice[];
    }
  | SlotError
  | DrawError;

/**
 * Re-roll one slot in rating mode: the same band search around the slot's
 * target, the current problem excluded from now on (v1 rules otherwise).
 */
export function rerollSlotByRating(input: {
  slots: readonly RatedSlot[];
  position: number;
  pool: readonly RatedCandidate[];
  rerolledIds: readonly string[];
  rerollCount: number;
  avoidSolved: boolean;
  rng: Rng;
  /** The slot's stored target; falls back to the current problem's rating. */
  target: number | null;
  maxRerolls?: number;
}): RatingRerollResult {
  if (input.rerollCount >= (input.maxRerolls ?? MAX_REROLLS)) return { ok: false, code: "reroll_limit" };
  const slot = input.slots.find((s) => s.position === input.position);
  if (!slot) return { ok: false, code: "slot_not_found" };
  if (slot.pinned) return { ok: false, code: "slot_pinned" };
  const target = input.target ?? slot.rating;
  const inSession = new Set(input.slots.map((s) => s.problemId));
  const rerolled = new Set(input.rerolledIds);
  rerolled.add(slot.problemId);
  const others = input.pool.filter((c) => !inSession.has(c.id));
  let candidates = others.filter((c) => !rerolled.has(c.id));
  const notices: DrawNotice[] = [];
  let reset = false;
  if (candidates.length === 0) {
    if (others.length === 0) return { ok: false, code: "no_candidates" };
    for (const c of input.pool) rerolled.delete(c.id);
    rerolled.add(slot.problemId);
    candidates = others;
    reset = true;
  }
  const chosen = pickForTarget(candidates, target, input.avoidSolved, input.rng);
  if (reset) notices.push({ code: "rerolls_reset", difficulty: chosen.difficulty });
  if (Math.abs(chosen.rating - target) > TARGETS_FAR) {
    notices.push({ code: "targets_far", difficulty: chosen.difficulty, position: slot.position, rating: chosen.rating, target });
  }
  const info = new Map(input.pool.map((c) => [c.id, c]));
  const slots = input.slots.map((s) =>
    s.position === slot.position
      ? toRatingDrawnSlot(
          { position: s.position, problemId: chosen.id, difficulty: chosen.difficulty, pinned: false },
          chosen,
          chosen.rating,
          target,
        )
      : toRatingDrawnSlot(
          { position: s.position, problemId: s.problemId, difficulty: s.difficulty, pinned: s.pinned },
          info.get(s.problemId),
          s.rating,
          null,
        ),
  );
  return { ok: true, slots, rerolledIds: [...rerolled], rerollCount: input.rerollCount + 1, notices };
}

/**
 * Re-roll all in rating mode: every unpinned problem is marked re-rolled and
 * the free slots are drawn again. Counts as one re-roll.
 */
export function rerollAllByRating(
  input: Omit<Parameters<typeof drawSlotsByRating>[0], "pinned" | "rerolledIds"> & {
    slots: readonly RatedSlot[];
    rerolledIds: readonly string[];
    rerollCount: number;
    maxRerolls?: number;
  },
): (Extract<RatingDrawResult, { ok: true }> & { rerollCount: number }) | SlotError | DrawError {
  if (input.rerollCount >= (input.maxRerolls ?? MAX_REROLLS)) return { ok: false, code: "reroll_limit" };
  const rerolled = new Set(input.rerolledIds);
  for (const s of input.slots) if (!s.pinned) rerolled.add(s.problemId);
  const result = drawSlotsByRating({
    ...input,
    pinned: input.slots.filter((s) => s.pinned),
    rerolledIds: [...rerolled],
  });
  if (!result.ok) return result;
  return { ...result, rerollCount: input.rerollCount + 1 };
}

// --- Lobby numbers (§6.3 "Shown") ---

export type RatingExpectation = {
  /** τ of the challenge. */
  target: number;
  problemCount: number;
  /** mean_u P(R_u, R_p) per slot ("room solve chance"). */
  slots: { position: number; rating: number; chance: number }[];
  /** "expected x.x of N" per person. */
  perUser: { userId: string; rating: number; expected: number }[];
  /** "about X of N per person (Y %; target Z %)". */
  room: { expectedPerPerson: number; share: number };
};

export function ratingExpectation(input: {
  people: readonly { userId: string; rating: number }[];
  slots: readonly { position: number; rating: number }[];
  challenge?: Challenge;
  tau?: number;
}): RatingExpectation {
  const target = input.tau ?? RATING_CHALLENGE_TARGETS[input.challenge ?? "balanced"];
  const ratings = input.slots.map((s) => s.rating);
  const perUser = input.people.map((p) => ({ userId: p.userId, rating: p.rating, expected: expectedSolves(p.rating, ratings) }));
  const slots = input.slots.map((s) => ({
    position: s.position,
    rating: s.rating,
    chance:
      input.people.length === 0
        ? 0
        : input.people.reduce((sum, p) => sum + solveProbability(p.rating, s.rating), 0) / input.people.length,
  }));
  const expectedPerPerson = perUser.length === 0 ? 0 : perUser.reduce((a, p) => a + p.expected, 0) / perUser.length;
  return {
    target,
    problemCount: input.slots.length,
    slots,
    perUser,
    room: { expectedPerPerson, share: input.slots.length === 0 ? 0 : expectedPerPerson / input.slots.length },
  };
}
