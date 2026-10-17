// Problem selection for room sessions (docs/specs/rooms.md §2). Pure and
// deterministic given the injected RNG: the server gathers the inputs
// (queries Q4, Q7, Q8) and persists the result.
import { pickOne, type Rng } from "./rng";
import {
  DIFFICULTIES,
  emptyMix,
  MAX_PROBLEM_COUNT,
  MIN_PROBLEM_COUNT,
  mixOf,
  mixTotal,
  type Challenge,
  type Difficulty,
  type Mix,
} from "./types";

// --- Constants (spec §2.2, §2.3, §2.5). Judgement calls, kept in one place. ---

/** Calibration window: the room's last K finished sessions. */
export const CALIBRATION_WINDOW = 6;
/** Prior weight m, in (participant, problem) pairs. */
export const PRIOR_WEIGHT = 4;
export const PRIOR_RATES: Readonly<Record<Difficulty, number>> = {
  easy: 0.8,
  medium: 0.5,
  hard: 0.25,
};
/** λ: pull towards the default shape. */
export const MIX_LAMBDA = 0.02;
/** Target share T of problems solved per person. */
export const CHALLENGE_TARGETS: Readonly<Record<Challenge, number>> = {
  relaxed: 0.65,
  balanced: 0.5,
  tough: 0.35,
};
export const MAX_REROLLS = 30;

/**
 * Default shape (e0, m0, h0) per problem count. `round(N/4)` half-up for easy
 * and hard, except N = 2, which the spec fixes at 1/1/0 (the formula would
 * give 1/0/1).
 */
const DEFAULT_SHAPES: Readonly<Record<number, Mix>> = {
  1: { easy: 0, medium: 1, hard: 0 },
  2: { easy: 1, medium: 1, hard: 0 },
  3: { easy: 1, medium: 1, hard: 1 },
  4: { easy: 1, medium: 2, hard: 1 },
  5: { easy: 1, medium: 3, hard: 1 },
  6: { easy: 2, medium: 2, hard: 2 },
  7: { easy: 2, medium: 3, hard: 2 },
  8: { easy: 2, medium: 4, hard: 2 },
};

const EPS = 1e-9;

function assertProblemCount(n: number): void {
  if (!Number.isInteger(n) || n < MIN_PROBLEM_COUNT || n > MAX_PROBLEM_COUNT) {
    throw new RangeError(`problem count must be an integer in 1..8, got ${n}`);
  }
}

export function defaultShape(problemCount: number): Mix {
  assertProblemCount(problemCount);
  return { ...DEFAULT_SHAPES[problemCount] };
}

// --- Calibration (§2.2) ---

export type DifficultyCounts = Record<Difficulty, { solved: number; pairs: number }>;

export type Calibration = {
  /** Finished sessions that contributed (0..K). */
  sessions: number;
  counts: DifficultyCounts;
  /** Smoothed solve rate r_d per difficulty. */
  rates: Record<Difficulty, number>;
};

/** One finished session, as read from room_session_problems + room_session_results. */
export type CalibrationSession = {
  /** Difficulty snapshot taken at pick time. */
  problems: readonly { position: number; difficulty: Difficulty }[];
  /**
   * Result rows. `attempts` counts only counted submits (compile and internal
   * errors excluded); `solved` = first accepted before `ends_at`.
   */
  results: readonly { userId: string; position: number; attempts: number; solved: boolean }[];
};

/** Bayesian average `(S + m·p) / (N + m)`. */
export function smoothedRate(
  solved: number,
  pairs: number,
  prior: number,
  weight: number = PRIOR_WEIGHT,
): number {
  return (solved + weight * prior) / (pairs + weight);
}

export function emptyCounts(): DifficultyCounts {
  return {
    easy: { solved: 0, pairs: 0 },
    medium: { solved: 0, pairs: 0 },
    hard: { solved: 0, pairs: 0 },
  };
}

/** Rates from already-aggregated counts (the shape query Q4 returns). */
export function calibrationFromCounts(counts: DifficultyCounts, sessions: number): Calibration {
  const rates = {} as Record<Difficulty, number>;
  for (const d of DIFFICULTIES) {
    rates[d] = smoothedRate(counts[d].solved, counts[d].pairs, PRIOR_RATES[d]);
  }
  return { sessions, counts, rates };
}

/**
 * `sessions` newest first; only the first K are used. An *active*
 * participant has at least one counted submit in that session; everyone else
 * (joined, never submitted, or only compile/internal errors) is excluded.
 */
export function computeCalibration(
  sessions: readonly CalibrationSession[],
  window: number = CALIBRATION_WINDOW,
): Calibration {
  const counts = emptyCounts();
  const recent = sessions.slice(0, window);
  for (const session of recent) {
    const active = new Set(session.results.filter((r) => r.attempts > 0).map((r) => r.userId));
    const solved = new Set(
      session.results.filter((r) => r.solved && r.attempts > 0).map((r) => `${r.userId}\u0000${r.position}`),
    );
    for (const userId of active) {
      for (const problem of session.problems) {
        counts[problem.difficulty].pairs += 1;
        if (solved.has(`${userId}\u0000${problem.position}`)) counts[problem.difficulty].solved += 1;
      }
    }
  }
  return calibrationFromCounts(counts, recent.length);
}

// --- Suggested mix (§2.3) ---

export type MixEvaluation = {
  mix: Mix;
  /** E: expected share solved per person. */
  expected: number;
  /** |E − T| */
  deviation: number;
  /** L1 distance from the default shape. */
  distance: number;
  cost: number;
};

export function enumerateMixes(problemCount: number): Mix[] {
  assertProblemCount(problemCount);
  const mixes: Mix[] = [];
  for (let easy = 0; easy <= problemCount; easy++) {
    for (let medium = 0; medium <= problemCount - easy; medium++) {
      mixes.push({ easy, medium, hard: problemCount - easy - medium });
    }
  }
  return mixes;
}

export function evaluateMix(
  mix: Mix,
  rates: Readonly<Record<Difficulty, number>>,
  target: number,
): MixEvaluation {
  const n = mixTotal(mix);
  const shape = defaultShape(n);
  const expected = (mix.easy * rates.easy + mix.medium * rates.medium + mix.hard * rates.hard) / n;
  const deviation = Math.abs(expected - target);
  const distance =
    Math.abs(mix.easy - shape.easy) + Math.abs(mix.medium - shape.medium) + Math.abs(mix.hard - shape.hard);
  return { mix, expected, deviation, distance, cost: deviation + MIX_LAMBDA * distance };
}

/** Order: cost, then |E − T|, then more medium, then fewer hard. */
export function compareEvaluations(a: MixEvaluation, b: MixEvaluation): number {
  if (Math.abs(a.cost - b.cost) > EPS) return a.cost - b.cost;
  if (Math.abs(a.deviation - b.deviation) > EPS) return a.deviation - b.deviation;
  if (a.mix.medium !== b.mix.medium) return b.mix.medium - a.mix.medium;
  return a.mix.hard - b.mix.hard;
}

/** All mixes for N, evaluated and sorted best first (for the panel and tests). */
export function rankMixes(
  problemCount: number,
  rates: Readonly<Record<Difficulty, number>>,
  target: number,
): MixEvaluation[] {
  return enumerateMixes(problemCount)
    .map((mix) => evaluateMix(mix, rates, target))
    .sort(compareEvaluations);
}

// --- Feasibility and errors (§2.6) ---

export type DrawErrorCode =
  /** Pool (after filters, pinned included) has fewer than N problems: 409. */
  | "pool_too_small"
  /** The mix asks for more of a difficulty than the pool has: 409. */
  | "mix_infeasible"
  /** Mix does not sum to N or has a bad count: 400. */
  | "invalid_mix"
  /** More pinned slots than N: 400 "Unpin a problem first". */
  | "too_many_pinned"
  /** A manual mix has fewer slots of a difficulty than are pinned: 400. */
  | "pinned_exceeds_mix";

export type DrawError = {
  ok: false;
  code: DrawErrorCode;
  /** Problems available per difficulty (filtered pool + pinned). */
  counts: Mix;
  requested?: Mix;
};

function isValidMix(mix: Mix): boolean {
  return DIFFICULTIES.every((d) => Number.isInteger(mix[d]) && mix[d] >= 0);
}

/**
 * Checks a mix against the pool. `available` = unpinned candidates per
 * difficulty; `pinned` = pinned slots per difficulty (they consume the mix).
 */
export function checkMix(input: {
  problemCount: number;
  mix: Mix;
  available: Mix;
  pinned?: Mix;
}): DrawError | null {
  const pinned = input.pinned ?? emptyMix();
  const counts: Mix = {
    easy: input.available.easy + pinned.easy,
    medium: input.available.medium + pinned.medium,
    hard: input.available.hard + pinned.hard,
  };
  const fail = (code: DrawErrorCode): DrawError => ({ ok: false, code, counts, requested: input.mix });
  if (!isValidMix(input.mix) || mixTotal(input.mix) !== input.problemCount) return fail("invalid_mix");
  if (mixTotal(pinned) > input.problemCount) return fail("too_many_pinned");
  if (mixTotal(counts) < input.problemCount) return fail("pool_too_small");
  if (DIFFICULTIES.some((d) => pinned[d] > input.mix[d])) return fail("pinned_exceeds_mix");
  if (DIFFICULTIES.some((d) => input.mix[d] - pinned[d] > input.available[d])) return fail("mix_infeasible");
  return null;
}

export type SuggestResult =
  | { ok: true; mix: Mix; evaluation: MixEvaluation; feasible: MixEvaluation[] }
  | DrawError;

/**
 * Best feasible mix by cost. Only feasible mixes are considered, so the only
 * possible errors are `pool_too_small` and `too_many_pinned`.
 */
export function suggestMix(input: {
  problemCount: number;
  rates: Readonly<Record<Difficulty, number>>;
  challenge?: Challenge;
  /** Overrides `challenge`. */
  target?: number;
  available: Mix;
  pinned?: Mix;
}): SuggestResult {
  assertProblemCount(input.problemCount);
  const target = input.target ?? CHALLENGE_TARGETS[input.challenge ?? "balanced"];
  const feasible = rankMixes(input.problemCount, input.rates, target).filter(
    (e) =>
      checkMix({ problemCount: input.problemCount, mix: e.mix, available: input.available, pinned: input.pinned }) ===
      null,
  );
  if (feasible.length === 0) {
    const error = checkMix({
      problemCount: input.problemCount,
      mix: defaultShape(input.problemCount),
      available: input.available,
      pinned: input.pinned,
    });
    if (error && error.code !== "pinned_exceeds_mix" && error.code !== "mix_infeasible") {
      return { ...error, requested: undefined };
    }
    // Unreachable: enough problems in total always admit some mix.
    throw new Error("suggestMix: no feasible mix although the pool is large enough");
  }
  return { ok: true, mix: { ...feasible[0].mix }, evaluation: feasible[0], feasible };
}

// --- Drawing (§2.4, §2.5) ---

export type CandidateProblem = {
  id: string;
  difficulty: Difficulty;
  /** Last start of a live/finished session of this room that used it (Q7); null = never. */
  lastUsedAt: Date | null;
  /** Number of expected participants with an accepted submit for it (Q8). */
  solvedBy: number;
};

export type Tier = "A" | "B" | "C";

export type Slot = {
  position: number;
  problemId: string;
  difficulty: Difficulty;
  pinned: boolean;
};

export type DrawnSlot = Slot & {
  /** Classification of the problem (null when unknown, e.g. a pin outside the pool). */
  tier: Tier | null;
  solvedBy: number | null;
  lastUsedAt: Date | null;
};

export type DrawNotice = {
  /** "No other unused options; showing earlier ones again" */
  code: "rerolls_reset";
  difficulty: Difficulty;
};

export function classify(c: CandidateProblem): Tier {
  if (c.lastUsedAt !== null) return "C";
  return c.solvedBy > 0 ? "B" : "A";
}

/** Sort key, smaller is better. With avoidSolved off tiers A and B merge. */
function rankKey(c: CandidateProblem, avoidSolved: boolean): [number, number] {
  const tier = classify(c);
  if (tier === "C") return [2, c.lastUsedAt!.getTime()];
  if (tier === "B" && avoidSolved) return [1, c.solvedBy];
  return [0, 0];
}

/** Uniform pick among the candidates sharing the best (tier, sub-order) key. */
export function pickCandidate(
  candidates: readonly CandidateProblem[],
  avoidSolved: boolean,
  rng: Rng,
): CandidateProblem {
  let best: CandidateProblem[] = [];
  let bestKey: [number, number] | null = null;
  for (const c of candidates) {
    const key = rankKey(c, avoidSolved);
    const cmp = bestKey === null ? -1 : key[0] - bestKey[0] || key[1] - bestKey[1];
    if (cmp < 0) {
      best = [c];
      bestKey = key;
    } else if (cmp === 0) {
      best.push(c);
    }
  }
  // Stable order before the random pick, so a seed reproduces regardless of input order.
  best.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return pickOne(best, rng);
}

function toDrawnSlot(slot: Slot, info: CandidateProblem | undefined): DrawnSlot {
  return {
    ...slot,
    tier: info ? classify(info) : null,
    solvedBy: info ? info.solvedBy : null,
    lastUsedAt: info ? info.lastUsedAt : null,
  };
}

/** Problems never used in this room, per difficulty ("Unused in this room: 7 easy…"). */
export function unusedCounts(pool: readonly CandidateProblem[]): Mix {
  return mixOf(pool.filter((c) => c.lastUsedAt === null));
}

/** Joined participants if at least 2, else all current members (§2.1). */
export function expectedParticipants(joined: readonly string[], members: readonly string[]): string[] {
  return joined.length >= 2 ? [...joined] : [...members];
}

export type DrawResult =
  | { ok: true; slots: DrawnSlot[]; rerolledIds: string[]; notices: DrawNotice[] }
  | DrawError;

/**
 * Fills every unpinned slot for the given mix. Pinned slots stay as they are
 * and consume one unit of their difficulty. Free positions are filled in
 * order Easy, then Medium, then Hard. Never substitutes another difficulty.
 */
export function drawSlots(input: {
  problemCount: number;
  mix: Mix;
  /** Published problems matching the topic filter, with usage info. */
  pool: readonly CandidateProblem[];
  pinned?: readonly Slot[];
  rerolledIds?: readonly string[];
  avoidSolved: boolean;
  rng: Rng;
}): DrawResult {
  assertProblemCount(input.problemCount);
  const n = input.problemCount;
  const pinnedIn = [...(input.pinned ?? [])].sort((a, b) => a.position - b.position);
  if (new Set(pinnedIn.map((s) => s.problemId)).size !== pinnedIn.length) {
    throw new Error("drawSlots: duplicate pinned problem");
  }
  const pinnedIds = new Set(pinnedIn.map((s) => s.problemId));
  const pool = input.pool.filter((c) => !pinnedIds.has(c.id));
  const error = checkMix({ problemCount: n, mix: input.mix, available: mixOf(pool), pinned: mixOf(pinnedIn) });
  if (error) return error;

  // Pinned slots keep their position; a pin beyond N (count lowered) moves to
  // the lowest free position.
  const taken = new Set<number>();
  const pinned: Slot[] = [];
  const overflow: Slot[] = [];
  for (const s of pinnedIn) {
    if (s.position >= 1 && s.position <= n && !taken.has(s.position)) {
      taken.add(s.position);
      pinned.push({ ...s, pinned: true });
    } else {
      overflow.push(s);
    }
  }
  const free = () => {
    const positions: number[] = [];
    for (let p = 1; p <= n; p++) if (!taken.has(p)) positions.push(p);
    return positions;
  };
  for (const s of overflow) {
    const position = free()[0];
    taken.add(position);
    pinned.push({ ...s, position, pinned: true });
  }

  const info = new Map(input.pool.map((c) => [c.id, c]));
  const used = new Set(pinnedIds);
  const rerolled = new Set(input.rerolledIds ?? []);
  const notices: DrawNotice[] = [];
  const pinnedMix = mixOf(pinned);
  const order: Difficulty[] = DIFFICULTIES.flatMap((d) =>
    Array.from({ length: input.mix[d] - pinnedMix[d] }, () => d),
  );
  const slots: DrawnSlot[] = pinned.map((s) => toDrawnSlot(s, info.get(s.problemId)));
  const positions = free();
  order.forEach((difficulty, i) => {
    const ofDifficulty = pool.filter((c) => c.difficulty === difficulty && !used.has(c.id));
    let candidates = ofDifficulty.filter((c) => !rerolled.has(c.id));
    if (candidates.length === 0) {
      for (const c of ofDifficulty) rerolled.delete(c.id);
      notices.push({ code: "rerolls_reset", difficulty });
      candidates = ofDifficulty;
    }
    const chosen = pickCandidate(candidates, input.avoidSolved, input.rng);
    used.add(chosen.id);
    slots.push(
      toDrawnSlot({ position: positions[i], problemId: chosen.id, difficulty, pinned: false }, chosen),
    );
  });
  slots.sort((a, b) => a.position - b.position);
  return { ok: true, slots, rerolledIds: [...rerolled], notices };
}

export type SlotErrorCode =
  /** 409 "Re-roll limit reached for this session" */
  | "reroll_limit"
  | "slot_not_found"
  /** A pinned slot is changed only by Unpin or another Pin. */
  | "slot_pinned"
  /** No other problem of this difficulty exists in the pool. */
  | "no_candidates"
  /** 409 "This problem is already in the session" */
  | "duplicate_problem";

export type SlotError = { ok: false; code: SlotErrorCode };

export type RerollResult =
  | {
      ok: true;
      slots: DrawnSlot[];
      rerolledIds: string[];
      rerollCount: number;
      notices: DrawNotice[];
    }
  | SlotError
  | DrawError;

/** Re-roll one slot: same difficulty, current problem excluded from now on. */
export function rerollSlot(input: {
  slots: readonly Slot[];
  position: number;
  pool: readonly CandidateProblem[];
  rerolledIds: readonly string[];
  rerollCount: number;
  avoidSolved: boolean;
  rng: Rng;
  maxRerolls?: number;
}): RerollResult {
  if (input.rerollCount >= (input.maxRerolls ?? MAX_REROLLS)) return { ok: false, code: "reroll_limit" };
  const slot = input.slots.find((s) => s.position === input.position);
  if (!slot) return { ok: false, code: "slot_not_found" };
  if (slot.pinned) return { ok: false, code: "slot_pinned" };

  const inSession = new Set(input.slots.map((s) => s.problemId));
  const rerolled = new Set(input.rerolledIds);
  rerolled.add(slot.problemId);
  const ofDifficulty = input.pool.filter((c) => c.difficulty === slot.difficulty && !inSession.has(c.id));
  let candidates = ofDifficulty.filter((c) => !rerolled.has(c.id));
  const notices: DrawNotice[] = [];
  if (candidates.length === 0) {
    if (ofDifficulty.length === 0) return { ok: false, code: "no_candidates" };
    for (const c of input.pool) if (c.difficulty === slot.difficulty) rerolled.delete(c.id);
    rerolled.add(slot.problemId);
    notices.push({ code: "rerolls_reset", difficulty: slot.difficulty });
    candidates = ofDifficulty;
  }
  const chosen = pickCandidate(candidates, input.avoidSolved, input.rng);
  const info = new Map(input.pool.map((c) => [c.id, c]));
  const slots = input.slots.map((s) =>
    s.position === slot.position
      ? toDrawnSlot({ ...s, problemId: chosen.id }, chosen)
      : toDrawnSlot(s, info.get(s.problemId)),
  );
  return { ok: true, slots, rerolledIds: [...rerolled], rerollCount: input.rerollCount + 1, notices };
}

/**
 * Re-roll all: every unpinned problem is marked re-rolled and the unpinned
 * slots are drawn again for `mix`. Counts as one re-roll.
 */
export function rerollAll(input: {
  problemCount: number;
  mix: Mix;
  slots: readonly Slot[];
  pool: readonly CandidateProblem[];
  rerolledIds: readonly string[];
  rerollCount: number;
  avoidSolved: boolean;
  rng: Rng;
  maxRerolls?: number;
}): RerollResult {
  if (input.rerollCount >= (input.maxRerolls ?? MAX_REROLLS)) return { ok: false, code: "reroll_limit" };
  const rerolled = new Set(input.rerolledIds);
  for (const s of input.slots) if (!s.pinned) rerolled.add(s.problemId);
  const result = drawSlots({
    problemCount: input.problemCount,
    mix: input.mix,
    pool: input.pool,
    pinned: input.slots.filter((s) => s.pinned),
    rerolledIds: [...rerolled],
    avoidSolved: input.avoidSolved,
    rng: input.rng,
  });
  if (!result.ok) return result;
  return { ...result, rerollCount: input.rerollCount + 1 };
}

export type PinResult = { ok: true; slots: Slot[] } | SlotError;

/**
 * Pins `problem` into slot `position` (filters ignored: a pin is an explicit
 * choice). The slot's difficulty becomes the problem's difficulty.
 */
export function pinSlot(
  slots: readonly Slot[],
  position: number,
  problem: { id: string; difficulty: Difficulty },
): PinResult {
  if (!slots.some((s) => s.position === position)) return { ok: false, code: "slot_not_found" };
  if (slots.some((s) => s.problemId === problem.id && s.position !== position)) {
    return { ok: false, code: "duplicate_problem" };
  }
  return {
    ok: true,
    slots: slots.map((s) =>
      s.position === position
        ? { position, problemId: problem.id, difficulty: problem.difficulty, pinned: true }
        : { ...s },
    ),
  };
}

/** Unpin keeps the problem in the slot; it becomes eligible for re-roll again. */
export function unpinSlot(slots: readonly Slot[], position: number): PinResult {
  if (!slots.some((s) => s.position === position)) return { ok: false, code: "slot_not_found" };
  return { ok: true, slots: slots.map((s) => (s.position === position ? { ...s, pinned: false } : { ...s })) };
}

/** The mix the slots actually have ("Actual: 1 Easy · 2 Medium · 1 Hard"). */
export function actualMix(slots: readonly Slot[]): Mix {
  return mixOf(slots);
}
