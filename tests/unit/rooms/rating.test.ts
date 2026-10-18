// Rooms v2 rating core (docs/specs/rooms-v2.md §6, AC-V2-RAT-1, AC-V2-SEL-1/2).
// The worked examples of §6.5 are reproduced to the precision the spec shows.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  BAND_DEFAULT_RATING,
  closedFormCenter,
  computeSessionRatings,
  drawSlotsByRating,
  expectedSolves,
  kFactor,
  K_ESTABLISHED,
  K_PROVISIONAL,
  ladderOffsets,
  meanSolveChance,
  pickForTarget,
  problemRating,
  ratingExpectation,
  ratingTargets,
  rerollAllByRating,
  rerollSlotByRating,
  roundHalfAway,
  solveCenter,
  solveProbability,
  startingRating,
  type RatedCandidate,
  type RatingParticipantInput,
} from "@/lib/rooms/rating";
import { createSeededRng } from "@/lib/rooms/rng";
import type { Difficulty } from "@/lib/rooms/types";

/** The 20 seed problems with their §8.1 author ratings. */
const CATALOG: [string, Difficulty, number][] = [
  ["fizz-buzz", "easy", 1050],
  ["reverse-string", "easy", 1080],
  ["contains-duplicate", "easy", 1120],
  ["palindrome-number", "easy", 1150],
  ["valid-anagram", "easy", 1150],
  ["two-sum", "easy", 1180],
  ["binary-search", "easy", 1250],
  ["valid-parentheses", "easy", 1270],
  ["climbing-stairs", "easy", 1300],
  ["best-time-to-buy-and-sell-stock", "easy", 1330],
  ["maximum-subarray", "easy", 1420],
  ["house-robber", "medium", 1500],
  ["product-of-array-except-self", "medium", 1560],
  ["merge-intervals", "medium", 1580],
  ["longest-substring-without-repeating-characters", "medium", 1620],
  ["coin-change", "medium", 1680],
  ["longest-common-subsequence", "medium", 1720],
  ["edit-distance", "hard", 1900],
  ["trapping-rain-water", "hard", 1950],
  ["longest-valid-parentheses", "hard", 2150],
];

function pool(overrides: Partial<Record<string, Partial<RatedCandidate>>> = {}): RatedCandidate[] {
  return CATALOG.map(([id, difficulty, rating]) => ({
    id,
    difficulty,
    rating,
    lastUsedAt: null,
    solvedBy: 0,
    ...overrides[id],
  }));
}

const LOBBY = { alice: 1620, bob: 1540, carol: 1450, dan: 1380 };
const LOBBY_RATINGS = Object.values(LOBBY);
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const round2 = (x: number) => Math.round(x * 100) / 100;

describe("solve probability and helpers", () => {
  it("is ½ at equal ratings and 10:1 at a 400-point gap", () => {
    expect(solveProbability(1500, 1500)).toBe(0.5);
    expect(solveProbability(1900, 1500)).toBeCloseTo(10 / 11, 12);
  });

  it("rounds half away from zero (symmetric for gains and losses), never −0", () => {
    expect(roundHalfAway(2.5)).toBe(3);
    expect(roundHalfAway(-2.5)).toBe(-3);
    expect(roundHalfAway(-4.6)).toBe(-5);
    expect(Object.is(roundHalfAway(-0.2), 0)).toBe(true);
  });

  it("problems without an author rating use the band default (easy 1200, medium 1600, hard 2000) plus adjust", () => {
    expect(BAND_DEFAULT_RATING).toEqual({ easy: 1200, medium: 1600, hard: 2000 });
    expect(problemRating({ difficulty: "medium", authorRating: null, ratingAdjust: 0 })).toBe(1600);
    expect(problemRating({ difficulty: "hard", authorRating: 1900, ratingAdjust: -7 })).toBe(1893);
  });

  it("k = K / max(N, 4); K = 160 while provisional (< 8 rated pairs), 96 after", () => {
    expect(kFactor(0, 4)).toBe(40);
    expect(kFactor(7, 4)).toBe(40);
    expect(kFactor(8, 4)).toBe(24);
    expect(kFactor(8, 1)).toBe(24);
    expect(kFactor(8, 8)).toBe(12);
    expect(kFactor(0, 8)).toBe(20);
  });
});

describe("starting rating per room (§6.4, AC-V2-RAT-4)", () => {
  it("self-reported first (clamped 1000–2600), then practice top-3 − 100 (clamped 1000–1800), else 1500", () => {
    expect(startingRating({ selfReported: 1850, practiceSolved: [2000, 2000, 2000] })).toEqual({ rating: 1850, source: "self_reported" });
    expect(startingRating({ selfReported: 3200, practiceSolved: [] })).toEqual({ rating: 2600, source: "self_reported" });
    expect(startingRating({ selfReported: 0, practiceSolved: [] })).toEqual({ rating: 1000, source: "self_reported" });
    expect(startingRating({ selfReported: null, practiceSolved: [1180, 1620, 1500, 1050] })).toEqual({
      rating: Math.round((1620 + 1500 + 1180) / 3 - 100),
      source: "practice",
    });
    expect(startingRating({ selfReported: null, practiceSolved: [2150, 1950, 1900] })).toEqual({ rating: 1800, source: "practice" });
    expect(startingRating({ selfReported: null, practiceSolved: [1050, 1080] })).toEqual({ rating: 1500, source: "default" });
  });
});

describe("§6.5 A: selection, N = 4, Balanced", () => {
  const picks = [1330, 1420, 1500, 1620];

  it("reproduces the P table, expectations and the room's 54 %", () => {
    const table = LOBBY_RATINGS.map((ru) => picks.map((rp) => round3(solveProbability(ru, rp))));
    expect(table).toEqual([
      [0.841, 0.76, 0.666, 0.5],
      [0.77, 0.666, 0.557, 0.387],
      [0.666, 0.543, 0.429, 0.273],
      [0.571, 0.443, 0.334, 0.201],
    ]);
    expect(LOBBY_RATINGS.map((ru) => round2(expectedSolves(ru, picks)))).toEqual([2.77, 2.38, 1.91, 1.55]);
    const exp = ratingExpectation({
      people: Object.entries(LOBBY).map(([userId, rating]) => ({ userId, rating })),
      slots: picks.map((rating, i) => ({ position: i + 1, rating })),
      challenge: "balanced",
    });
    expect(round2(exp.room.expectedPerPerson)).toBe(2.15);
    expect(Math.round(exp.room.share * 100)).toBe(54);
    expect(exp.target).toBe(0.55);
  });

  it("finds the center by bisection and the targets 1307 · 1407 · 1507 · 1607", () => {
    expect(closedFormCenter(LOBBY_RATINGS, 0.55)).toBeCloseTo(1462.6, 1);
    const plan = ratingTargets({ ratings: LOBBY_RATINGS, freeCount: 4, challenge: "balanced" });
    expect(Math.round(plan.center)).toBe(1457);
    expect(plan.targets).toEqual([1307, 1407, 1507, 1607]);
    expect(plan.widened).toBe(false);
    expect(Math.abs(meanSolveChance(LOBBY_RATINGS, plan.center, plan.offsets) - 0.55)).toBeLessThan(0.001);
  });

  it("draws one problem within ±100 of each target, warm-up first", () => {
    const result = drawSlotsByRating({
      problemCount: 4,
      pool: pool(),
      avoidSolved: true,
      rng: createSeededRng(7),
      ratings: LOBBY_RATINGS,
      challenge: "balanced",
    });
    if (!result.ok) throw new Error(result.code);
    expect(result.slots.map((s) => s.target)).toEqual([1307, 1407, 1507, 1607]);
    for (const s of result.slots) expect(Math.abs(s.rating - s.target!)).toBeLessThanOrEqual(100);
    expect(result.slots.map((s) => s.position)).toEqual([1, 2, 3, 4]);
    expect(result.notices).toEqual([]);
  });

  it("the spec's picks (1330 +23, 1420 +13, 1500 −7, 1620 +13) are one of the seeded outcomes", () => {
    const spec = JSON.stringify([
      [1330, 23],
      [1420, 13],
      [1500, -7],
      [1620, 13],
    ]);
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const result = drawSlotsByRating({
        problemCount: 4,
        pool: pool(),
        avoidSolved: true,
        rng: createSeededRng(seed),
        ratings: LOBBY_RATINGS,
        challenge: "balanced",
      });
      if (!result.ok) throw new Error(result.code);
      outcomes.add(JSON.stringify(result.slots.map((s) => [s.rating, s.rating - s.target!])));
    }
    expect(outcomes.has(spec)).toBe(true);
  });
});

describe("§6.5 B: rating update after that session", () => {
  const problems = [1330, 1420, 1500, 1620].map((rating, i) => ({ key: String(i + 1), rating }));
  const participants: RatingParticipantInput[] = [
    { userId: "alice", rating: 1620, ratedPairs: 20, active: true, solved: ["1", "2", "3"] },
    { userId: "bob", rating: 1540, ratedPairs: 20, active: true, solved: ["1", "2", "3"] },
    { userId: "carol", rating: 1450, ratedPairs: 20, active: true, solved: ["1", "2", "3"] },
    { userId: "dan", rating: 1380, ratedPairs: 0, active: true, solved: ["1"] },
  ];

  it("people: +6, +15, +26, −22 (dan provisional, k = 40)", () => {
    const update = computeSessionRatings({ problems, participants });
    expect(update.participants.map((p) => [p.userId, p.k, p.delta, p.after])).toEqual([
      ["alice", 24, 6, 1626],
      ["bob", 24, 15, 1555],
      ["carol", 24, 26, 1476],
      ["dan", 40, -22, 1358],
    ]);
  });

  it("problems: Σ(s − P) = 1.151, 0.588, 1.014, −1.361 → 1325, 1418, 1496, 1625", () => {
    const update = computeSessionRatings({ problems, participants });
    // Rounded from 1.1515…, 0.5875…, 1.0141…, −1.3614… (the spec truncates 1.1515 to 1.151).
    expect(update.problems.map((p) => Math.round(p.surprise * 100) / 100)).toEqual([1.15, 0.59, 1.01, -1.36]);
    expect(update.problems.map((p) => p.adjustDelta)).toEqual([-5, -2, -4, 5]);
    expect(update.problems.map((p) => p.before + p.adjustDelta)).toEqual([1325, 1418, 1496, 1625]);
  });
});

describe("§6.5 C: one-problem session (Coin Change 1680)", () => {
  it("k = 24 (40 provisional): alice +14, bob +17, carol +19, dan −6; Coin Change → 1672", () => {
    const update = computeSessionRatings({
      problems: [{ key: "1", rating: 1680 }],
      participants: [
        { userId: "alice", rating: 1620, ratedPairs: 8, active: true, solved: ["1"] },
        { userId: "bob", rating: 1540, ratedPairs: 8, active: true, solved: ["1"] },
        { userId: "carol", rating: 1450, ratedPairs: 8, active: true, solved: ["1"] },
        { userId: "dan", rating: 1380, ratedPairs: 4, active: true, solved: [] },
      ],
    });
    expect(update.participants.map((p) => p.delta)).toEqual([14, 17, 19, -6]);
    expect(round3(update.problems[0].surprise)).toBe(1.916);
    expect(update.problems[0].adjustDelta).toBe(-8);
    expect(1680 + update.problems[0].adjustDelta).toBe(1672);
  });

  it("selection for N = 1: one target at the center (offset 0); House Robber 1500 is in its ±100 band", () => {
    const plan = ratingTargets({ ratings: LOBBY_RATINGS, freeCount: 1, challenge: "balanced" });
    expect(plan.offsets).toEqual([0]);
    // The spec text says c = 1500; the bisection over these four people gives 1460 (see report).
    expect(plan.targets).toEqual([1460]);
    expect(Math.abs(1500 - plan.targets[0])).toBeLessThanOrEqual(100);
  });
});

describe("§6.5 D: huge spread", () => {
  it("widens the ladder to w = 650: targets 1159 · 1376 · 1592 · 1809 around c = 1484", () => {
    const ratings = [1250, 1500, 1900];
    expect(ladderOffsets(4, ratings).width).toBe(650);
    const plan = ratingTargets({ ratings, freeCount: 4, challenge: "balanced" });
    expect(plan.widened).toBe(true);
    expect(Math.round(plan.center)).toBe(1484);
    expect(plan.targets).toEqual([1159, 1376, 1592, 1809]);
  });

  it("ladder widths: N = 1 → 0, N = 2 → ±50, N = 4 → ±150, N ≥ 5 → ±200, spread capped at 800", () => {
    const offsets = (n: number) => ladderOffsets(n, [1500]).offsets.map((o) => Math.round(o));
    expect(offsets(1)).toEqual([0]);
    expect(offsets(2)).toEqual([-50, 50]);
    expect(offsets(4)).toEqual([-150, -50, 50, 150]);
    expect(offsets(5)).toEqual([-200, -100, 0, 100, 200]);
    expect(ladderOffsets(8, [1500]).width).toBe(400);
    expect(ladderOffsets(4, [900, 2500]).width).toBe(800);
  });
});

describe("rating draw (AC-V2-SEL-1, AC-V2-SEL-2)", () => {
  it("prefers tier A over B over C inside the band", () => {
    const candidates: RatedCandidate[] = [
      { id: "c", difficulty: "easy", rating: 1500, lastUsedAt: new Date("2026-01-01"), solvedBy: 0 },
      { id: "b", difficulty: "easy", rating: 1500, lastUsedAt: null, solvedBy: 1 },
      { id: "a", difficulty: "easy", rating: 1590, lastUsedAt: null, solvedBy: 0 },
      { id: "near-but-far-band", difficulty: "easy", rating: 1700, lastUsedAt: null, solvedBy: 0 },
    ];
    expect(pickForTarget(candidates, 1500, true, createSeededRng(1)).id).toBe("a");
    expect(pickForTarget(candidates.filter((c) => c.id !== "a"), 1500, true, createSeededRng(1)).id).toBe("b");
    expect(pickForTarget(candidates.filter((c) => c.id === "c" || c.id === "near-but-far-band"), 1500, true, createSeededRng(1)).id).toBe("c");
    // A closer band wins over a better tier further away.
    expect(pickForTarget([candidates[0], candidates[3]], 1500, true, createSeededRng(1)).id).toBe("c");
    // With avoidSolved off, A and B merge (v1 rule).
    const merged = new Set<string>();
    for (let seed = 1; seed < 40; seed++) merged.add(pickForTarget(candidates.slice(0, 3), 1500, false, createSeededRng(seed)).id);
    expect(merged).toEqual(new Set(["a", "b"]));
  });

  it("reports targets_far (a warning) when nothing lies within 300, and takes the closest", () => {
    const result = drawSlotsByRating({
      problemCount: 1,
      pool: pool().filter((p) => p.rating < 1200),
      avoidSolved: true,
      rng: createSeededRng(3),
      ratings: [2200],
      challenge: "balanced",
    });
    if (!result.ok) throw new Error(result.code);
    expect(result.slots[0].problemId).toBe("two-sum");
    expect(result.notices).toEqual([
      { code: "targets_far", difficulty: "easy", position: 1, rating: 1180, target: result.slots[0].target },
    ]);
  });

  it("keeps pinned slots, uses their rating in the mean, and targets only the free slots", () => {
    const result = drawSlotsByRating({
      problemCount: 4,
      pool: pool(),
      pinned: [{ position: 2, problemId: "longest-valid-parentheses", difficulty: "hard", pinned: true, rating: 2150 }],
      avoidSolved: true,
      rng: createSeededRng(11),
      ratings: LOBBY_RATINGS,
      challenge: "balanced",
    });
    if (!result.ok) throw new Error(result.code);
    expect(result.slots[1]).toMatchObject({ position: 2, problemId: "longest-valid-parentheses", pinned: true, target: null });
    expect(result.targetsByPosition[1]).toBeNull();
    const free = result.targetsByPosition.filter((t): t is number => t !== null);
    expect(free).toEqual([...free].sort((a, b) => a - b));
    expect(Math.abs(meanSolveChance(LOBBY_RATINGS, result.plan.center, result.plan.offsets, [2150]) - 0.55)).toBeLessThan(0.001);
  });

  it("errors: pool_too_small and too_many_pinned (no mix_infeasible in rating mode)", () => {
    const small = drawSlotsByRating({ problemCount: 4, pool: pool().slice(0, 3), avoidSolved: true, rng: createSeededRng(1), ratings: [1500] });
    expect(small).toMatchObject({ ok: false, code: "pool_too_small" });
    const pinned = ["a", "b"].map((id, i) => ({ position: i + 1, problemId: id, difficulty: "easy" as const, pinned: true, rating: 1500 }));
    expect(drawSlotsByRating({ problemCount: 1, pool: pool(), pinned, avoidSolved: true, rng: createSeededRng(1), ratings: [1500] })).toMatchObject({
      ok: false,
      code: "too_many_pinned",
    });
  });

  it("re-roll searches around the slot target and excludes the current problem; re-roll all counts once", () => {
    const first = drawSlotsByRating({ problemCount: 4, pool: pool(), avoidSolved: true, rng: createSeededRng(5), ratings: LOBBY_RATINGS });
    if (!first.ok) throw new Error(first.code);
    const slots = first.slots.map((s) => ({ position: s.position, problemId: s.problemId, difficulty: s.difficulty, pinned: false, rating: s.rating }));
    const r = rerollSlotByRating({
      slots,
      position: 2,
      pool: pool(),
      rerolledIds: first.rerolledIds,
      rerollCount: 0,
      avoidSolved: true,
      rng: createSeededRng(9),
      target: first.targetsByPosition[1],
    });
    if (!r.ok) throw new Error(r.code);
    expect(r.slots[1].problemId).not.toBe(slots[1].problemId);
    expect(Math.abs(r.slots[1].rating - first.targetsByPosition[1]!)).toBeLessThanOrEqual(100);
    expect(r.rerolledIds).toContain(slots[1].problemId);
    expect(r.rerollCount).toBe(1);
    const all = rerollAllByRating({
      problemCount: 4,
      slots,
      pool: pool(),
      rerolledIds: [],
      rerollCount: 3,
      avoidSolved: true,
      rng: createSeededRng(2),
      ratings: LOBBY_RATINGS,
    });
    if (!all.ok) throw new Error(all.code);
    expect(all.rerollCount).toBe(4);
    for (const s of slots) expect(all.slots.map((x) => x.problemId)).not.toContain(s.problemId);
    expect(rerollSlotByRating({ slots, position: 1, pool: pool(), rerolledIds: [], rerollCount: 30, avoidSolved: true, rng: createSeededRng(1), target: null })).toEqual({
      ok: false,
      code: "reroll_limit",
    });
  });
});

// --- Properties ---------------------------------------------------------

const ratingArb = fc.integer({ min: 900, max: 2400 });
const sessionArb = fc
  .record({
    problems: fc.array(ratingArb, { minLength: 1, maxLength: 8 }),
    people: fc.array(
      fc.record({ rating: ratingArb, ratedPairs: fc.integer({ min: 0, max: 40 }), active: fc.boolean(), solvedMask: fc.integer({ min: 0, max: 255 }) }),
      { minLength: 1, maxLength: 8 },
    ),
  })
  .map(({ problems, people }) => ({
    problems: problems.map((rating, i) => ({ key: String(i + 1), rating })),
    participants: people.map((p, u) => ({
      userId: `u${u}`,
      rating: p.rating,
      ratedPairs: p.ratedPairs,
      active: p.active,
      solved: problems.flatMap((_, i) => ((p.solvedMask >> i) & 1 ? [String(i + 1)] : [])),
    })),
  }));

describe("rating properties", () => {
  it("P is in (0, 1), complementary, and falls as the problem gets harder", () => {
    fc.assert(
      fc.property(ratingArb, ratingArb, fc.integer({ min: 1, max: 500 }), (u, p, d) => {
        const x = solveProbability(u, p);
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(1);
        expect(x + solveProbability(p, u)).toBeCloseTo(1, 12);
        expect(solveProbability(u, p + d)).toBeLessThan(x);
      }),
    );
  });

  it("caps: |ΔR| ≤ K (96, provisional 160); with N = 1 at most 24 (40 provisional); inactive people never move", () => {
    fc.assert(
      fc.property(sessionArb, (input) => {
        const n = input.problems.length;
        for (const p of computeSessionRatings(input).participants) {
          const K = p.provisional ? K_PROVISIONAL : K_ESTABLISHED;
          expect(Math.abs(p.delta)).toBeLessThanOrEqual(Math.ceil((K / Math.max(n, 4)) * n));
          expect(Math.abs(p.delta)).toBeLessThanOrEqual(K);
          if (n === 1) expect(Math.abs(p.delta)).toBeLessThanOrEqual(p.provisional ? 40 : 24);
          if (!p.active) expect(p.delta).toBe(0);
        }
      }),
    );
  });

  it("monotonicity: solving one more problem never lowers the change", () => {
    fc.assert(
      fc.property(sessionArb, fc.nat(7), (input, extra) => {
        const key = String((extra % input.problems.length) + 1);
        const me = { ...input.participants[0], active: true };
        const more = { ...me, solved: [...new Set([...me.solved, key])] };
        const a = computeSessionRatings({ ...input, participants: [me, ...input.participants.slice(1)] }).participants[0];
        const b = computeSessionRatings({ ...input, participants: [more, ...input.participants.slice(1)] }).participants[0];
        expect(b.delta).toBeGreaterThanOrEqual(a.delta);
      }),
    );
  });

  it("zero-sum-ish: people gain what problems lose, up to rounding (k·T vs −4·T)", () => {
    fc.assert(
      fc.property(sessionArb, (input) => {
        const update = computeSessionRatings(input);
        let total = 0; // T = Σ over active pairs (s − P)
        for (const p of update.problems) total += p.surprise;
        const active = update.participants.filter((p) => p.active);
        const rawPeople = active.reduce((sum, p) => sum + p.k * (p.solved - p.expected), 0);
        const people = active.reduce((sum, p) => sum + p.delta, 0);
        const probs = update.problems.reduce((sum, p) => sum + p.adjustDelta, 0);
        expect(Math.abs(people - rawPeople)).toBeLessThanOrEqual(active.length * 0.5 + 1e-9);
        expect(Math.abs(probs + 4 * total)).toBeLessThanOrEqual(update.problems.length * 0.5 + 1e-9);
        if (Math.abs(total) > 1) expect(Math.sign(rawPeople)).toBe(Math.sign(total));
      }),
    );
  });

  it("determinism: the same input gives the same update and the same draw", () => {
    fc.assert(
      fc.property(sessionArb, fc.integer(), fc.array(ratingArb, { minLength: 1, maxLength: 6 }), fc.integer({ min: 1, max: 8 }), (input, seed, ratings, n) => {
        expect(computeSessionRatings(input)).toEqual(computeSessionRatings(input));
        const draw = () => drawSlotsByRating({ problemCount: n, pool: pool(), avoidSolved: true, rng: createSeededRng(seed), ratings });
        expect(draw()).toEqual(draw());
      }),
    );
  });

  it("bisection hits τ within 0.001 whenever τ is reachable in [800, 3000]", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1000, max: 2200 }), { minLength: 1, maxLength: 8 }),
        fc.integer({ min: 1, max: 8 }),
        fc.constantFrom(0.75, 0.55, 0.35),
        (ratings, n, tau) => {
          const { offsets } = ladderOffsets(n, ratings);
          const c = solveCenter({ ratings, offsets, tau });
          // Unreachable τ (a very wide ladder near the range ends) stops at the boundary.
          fc.pre(c > 801 && c < 2999);
          expect(Math.abs(meanSolveChance(ratings, c, offsets) - tau)).toBeLessThan(0.001);
        },
      ),
    );
  });

  it("each pick lies in the narrowest band (100/200/300) that has a candidate, else is the closest; unique problems", () => {
    fc.assert(
      fc.property(fc.array(ratingArb, { minLength: 1, maxLength: 6 }), fc.integer({ min: 1, max: 8 }), fc.integer(), (ratings, n, seed) => {
        const result = drawSlotsByRating({ problemCount: n, pool: pool(), avoidSolved: true, rng: createSeededRng(seed), ratings });
        if (!result.ok) throw new Error(result.code);
        expect(new Set(result.slots.map((s) => s.problemId)).size).toBe(n);
        const used = new Set<string>();
        for (const s of result.slots) {
          const closest = Math.min(...pool().filter((p) => !used.has(p.id)).map((p) => Math.abs(p.rating - s.target!)));
          const bound = closest <= 100 ? 100 : closest <= 200 ? 200 : closest <= 300 ? 300 : closest;
          expect(Math.abs(s.rating - s.target!)).toBeLessThanOrEqual(bound);
          used.add(s.problemId);
        }
      }),
    );
  });
});
