import { describe, expect, it } from "vitest";

import { createSeededRng } from "@/lib/rooms/rng";
import {
  actualMix,
  calibrationFromCounts,
  checkMix,
  computeCalibration,
  defaultShape,
  drawSlots,
  enumerateMixes,
  evaluateMix,
  expectedParticipants,
  pinSlot,
  PRIOR_RATES,
  rankMixes,
  rerollAll,
  rerollSlot,
  suggestMix,
  unpinSlot,
  unusedCounts,
  type CalibrationSession,
  type CandidateProblem,
  type Slot,
} from "@/lib/rooms/selection";
import type { Difficulty, Mix } from "@/lib/rooms/types";

const mixStr = (m: Mix) => `${m.easy}/${m.medium}/${m.hard}`;
const BIG: Mix = { easy: 11, medium: 6, hard: 3 };

function candidate(
  id: string,
  difficulty: Difficulty,
  extra: Partial<CandidateProblem> = {},
): CandidateProblem {
  return { id, difficulty, lastUsedAt: null, solvedBy: 0, ...extra };
}

/** A pool of `n` never-used problems per difficulty: e1..en, m1.., h1.. */
function pool(counts: Mix): CandidateProblem[] {
  return (["easy", "medium", "hard"] as const).flatMap((d) =>
    Array.from({ length: counts[d] }, (_, i) => candidate(`${d[0]}${i + 1}`, d)),
  );
}

describe("defaultShape (fixed table)", () => {
  it.each([
    [1, "0/1/0"],
    [2, "1/1/0"],
    [3, "1/1/1"],
    [4, "1/2/1"],
    [5, "1/3/1"],
    [6, "2/2/2"],
    [7, "2/3/2"],
    [8, "2/4/2"],
  ])("N=%i → %s", (n, shape) => {
    expect(mixStr(defaultShape(n))).toBe(shape);
  });

  it("rejects counts outside 1..8", () => {
    expect(() => defaultShape(0)).toThrow(RangeError);
    expect(() => defaultShape(9)).toThrow(RangeError);
  });

  it("enumerates 15 mixes for N=4 and 45 for N=8", () => {
    expect(enumerateMixes(4)).toHaveLength(15);
    expect(enumerateMixes(8)).toHaveLength(45);
  });
});

describe("Example A: cold start", () => {
  const calibration = computeCalibration([]);

  it("uses the priors only", () => {
    expect(calibration.sessions).toBe(0);
    expect(calibration.rates).toEqual(PRIOR_RATES);
  });

  it.each([
    [{ easy: 1, medium: 2, hard: 1 }, 0.5125, 0.0125, 0, 0.0125],
    [{ easy: 0, medium: 4, hard: 0 }, 0.5, 0, 4, 0.08],
    [{ easy: 2, medium: 1, hard: 1 }, 0.5875, 0.0875, 2, 0.1275],
    [{ easy: 2, medium: 0, hard: 2 }, 0.525, 0.025, 4, 0.105],
  ])("table row %o", (mix, expected, deviation, distance, cost) => {
    const e = evaluateMix(mix, calibration.rates, 0.5);
    expect(e.expected).toBeCloseTo(expected, 4);
    expect(e.deviation).toBeCloseTo(deviation, 4);
    expect(e.distance).toBe(distance);
    expect(e.cost).toBeCloseTo(cost, 4);
  });

  it("suggests 1 Easy · 2 Medium · 1 Hard", () => {
    const r = suggestMix({ problemCount: 4, rates: calibration.rates, challenge: "balanced", available: BIG });
    expect(r.ok && mixStr(r.mix)).toBe("1/2/1");
  });

  it("ranks all 15 mixes in a fixed order (table-driven)", () => {
    const ranked = rankMixes(4, calibration.rates, 0.5);
    for (const e of ranked) {
      const hand = (e.mix.easy * 0.8 + e.mix.medium * 0.5 + e.mix.hard * 0.25) / 4;
      expect(e.expected).toBeCloseTo(hand, 10);
    }
    // Costs by hand: .0125, .08, .09, .1025, .105, .115, .1275, .165, .19,
    // .1925, .2425, .2675, .305, .37, .42.
    expect(ranked.map((e) => mixStr(e.mix))).toEqual([
      "1/2/1", "0/4/0", "1/1/2", "0/3/1", "2/0/2", "1/3/0", "2/1/1", "0/2/2",
      "2/2/0", "1/0/3", "3/0/1", "0/1/3", "3/1/0", "0/0/4", "4/0/0",
    ]);
  });
});

/** Three sessions of 1/2/1 with 4 active people: easy 11/12, medium 9/24, hard 0/12. */
function exampleBSessions(): CalibrationSession[] {
  const problems = [
    { position: 1, difficulty: "easy" as const },
    { position: 2, difficulty: "medium" as const },
    { position: 3, difficulty: "medium" as const },
    { position: 4, difficulty: "hard" as const },
  ];
  const people = ["a", "b", "c", "d"];
  // Solved per session: easy 4,4,3 (=11); medium 3,3,3 (=9); hard 0.
  const easySolved = [4, 4, 3];
  const mediumSolved = [3, 3, 3];
  return [0, 1, 2].map((s) => {
    const results: CalibrationSession["results"][number][] = [];
    people.forEach((userId, i) => {
      results.push({ userId, position: 1, attempts: 1, solved: i < easySolved[s] });
      // medium: 3 solves spread over positions 2 and 3
      const mediumSolves = [i < 2, i === 2 && mediumSolved[s] === 3];
      results.push({ userId, position: 2, attempts: 1, solved: mediumSolves[0] });
      results.push({ userId, position: 3, attempts: mediumSolves[1] ? 1 : 0, solved: mediumSolves[1] });
      results.push({ userId, position: 4, attempts: 1, solved: false });
    });
    // Joined, never submitted (no rows) and compile-error only (attempts 0): both excluded.
    results.push({ userId: "compile_only", position: 1, attempts: 0, solved: false });
    return { problems, results };
  });
}

describe("Example B: the room struggles with hard", () => {
  const calibration = computeCalibration(exampleBSessions());

  it("counts pairs of active participants only", () => {
    expect(calibration.sessions).toBe(3);
    expect(calibration.counts).toEqual({
      easy: { solved: 11, pairs: 12 },
      medium: { solved: 9, pairs: 24 },
      hard: { solved: 0, pairs: 12 },
    });
  });

  it("reproduces the smoothed rates to 4 decimals", () => {
    expect(calibration.rates.easy).toBeCloseTo(0.8875, 4);
    expect(calibration.rates.medium).toBeCloseTo(0.3929, 4);
    expect(calibration.rates.hard).toBeCloseTo(0.0625, 4);
  });

  it.each([
    [{ easy: 1, medium: 2, hard: 1 }, 0.4339, 0.0661, 0, 0.0661],
    [{ easy: 1, medium: 3, hard: 0 }, 0.5165, 0.0165, 2, 0.0565],
    [{ easy: 2, medium: 1, hard: 1 }, 0.5576, 0.0576, 2, 0.0976],
    [{ easy: 2, medium: 2, hard: 0 }, 0.6402, 0.1402, 2, 0.1802],
  ])("table row %o", (mix, expected, deviation, distance, cost) => {
    const e = evaluateMix(mix, calibration.rates, 0.5);
    expect(e.expected).toBeCloseTo(expected, 4);
    expect(e.deviation).toBeCloseTo(deviation, 4);
    expect(e.distance).toBe(distance);
    expect(e.cost).toBeCloseTo(cost, 4);
  });

  it("suggests 1 Easy · 3 Medium · 0 Hard, about 2.07 of 4 per person", () => {
    const r = suggestMix({ problemCount: 4, rates: calibration.rates, available: BIG });
    if (!r.ok) throw new Error(r.code);
    expect(mixStr(r.mix)).toBe("1/3/0");
    expect(r.evaluation.expected * 4).toBeCloseTo(2.07, 2);
  });

  it("only the last K=6 sessions count", () => {
    const old = { problems: [{ position: 1, difficulty: "hard" as const }], results: [{ userId: "x", position: 1, attempts: 1, solved: true }] };
    const sessions = [...exampleBSessions(), ...exampleBSessions(), old];
    expect(computeCalibration(sessions).sessions).toBe(6);
    expect(computeCalibration(sessions).counts.hard.solved).toBe(0);
  });
});

describe("Example C: a strong room", () => {
  const calibration = calibrationFromCounts(
    { easy: { solved: 20, pairs: 20 }, medium: { solved: 18, pairs: 24 }, hard: { solved: 5, pairs: 12 } },
    6,
  );

  it("reproduces the smoothed rates to 4 decimals", () => {
    expect(calibration.rates.easy).toBeCloseTo(0.9667, 4);
    expect(calibration.rates.medium).toBeCloseTo(0.7143, 4);
    expect(calibration.rates.hard).toBeCloseTo(0.375, 4);
  });

  it.each([
    [{ easy: 1, medium: 2, hard: 1 }, 0.6926, 0.1926],
    [{ easy: 0, medium: 2, hard: 2 }, 0.5446, 0.0846],
    [{ easy: 0, medium: 1, hard: 3 }, 0.4598, 0.1202],
    [{ easy: 1, medium: 1, hard: 2 }, 0.6077, 0.1477],
  ])("table row %o", (mix, expected, cost) => {
    const e = evaluateMix(mix, calibration.rates, 0.5);
    expect(e.expected).toBeCloseTo(expected, 4);
    expect(e.cost).toBeCloseTo(cost, 4);
  });

  it("suggests 0 Easy · 2 Medium · 2 Hard", () => {
    const r = suggestMix({ problemCount: 4, rates: calibration.rates, available: BIG });
    expect(r.ok && mixStr(r.mix)).toBe("0/2/2");
  });

  it("falls back to the next feasible mix when only 1 hard problem matches (topic Stack)", () => {
    const r = suggestMix({ problemCount: 4, rates: calibration.rates, available: { easy: 3, medium: 3, hard: 1 } });
    if (!r.ok) throw new Error(r.code);
    // 0/3/1: E = (3·0.7143 + 0.375)/4 = 0.6295, C = 0.1295 + 0.02·2 = 0.1695 (cheapest with h ≤ 1).
    expect(mixStr(r.mix)).toBe("0/3/1");
    expect(r.evaluation.cost).toBeCloseTo(0.1695, 4);
    expect(r.feasible.every((e) => e.mix.hard <= 1)).toBe(true);
  });
});

describe("tie-breaks", () => {
  it("equal cost → smaller |E−T| → more medium → fewer hard", () => {
    const flat = { easy: 0.5, medium: 0.5, hard: 0.5 };
    const ranked = rankMixes(4, flat, 0.5).map((e) => mixStr(e.mix));
    // All deviations are 0; cost = 0.02·L1. L1 = 2 group in tie-break order:
    expect(ranked.slice(0, 7)).toEqual(["1/2/1", "1/3/0", "0/3/1", "2/2/0", "0/2/2", "2/1/1", "1/1/2"]);
  });

  it("is independent of evaluation order", () => {
    const rates = { easy: 0.9, medium: 0.4, hard: 0.1 };
    expect(rankMixes(5, rates, 0.35)).toEqual(rankMixes(5, rates, 0.35));
  });
});

describe("pool too small / mix infeasible (§2.6)", () => {
  it("pool smaller than N → pool_too_small with counts", () => {
    const r = suggestMix({ problemCount: 4, rates: PRIOR_RATES, available: { easy: 1, medium: 1, hard: 1 } });
    expect(r).toMatchObject({ ok: false, code: "pool_too_small", counts: { easy: 1, medium: 1, hard: 1 } });
    const d = drawSlots({
      problemCount: 4,
      mix: { easy: 1, medium: 2, hard: 1 },
      pool: pool({ easy: 1, medium: 1, hard: 1 }),
      avoidSolved: true,
      rng: createSeededRng(1),
    });
    expect(d).toMatchObject({ ok: false, code: "pool_too_small", counts: { easy: 1, medium: 1, hard: 1 } });
  });

  it("manual mix asking for 2 hard with 1 available → mix_infeasible, no substitution", () => {
    const d = drawSlots({
      problemCount: 4,
      mix: { easy: 1, medium: 1, hard: 2 },
      pool: pool({ easy: 6, medium: 4, hard: 1 }),
      avoidSolved: true,
      rng: createSeededRng(1),
    });
    expect(d).toEqual({
      ok: false,
      code: "mix_infeasible",
      counts: { easy: 6, medium: 4, hard: 1 },
      requested: { easy: 1, medium: 1, hard: 2 },
    });
  });

  it("mix not summing to N → invalid_mix; more pins than N → too_many_pinned", () => {
    expect(checkMix({ problemCount: 4, mix: { easy: 1, medium: 1, hard: 1 }, available: BIG })?.code).toBe("invalid_mix");
    expect(
      checkMix({ problemCount: 2, mix: { easy: 1, medium: 1, hard: 0 }, available: BIG, pinned: { easy: 3, medium: 0, hard: 0 } })?.code,
    ).toBe("too_many_pinned");
    expect(
      checkMix({ problemCount: 2, mix: { easy: 0, medium: 2, hard: 0 }, available: BIG, pinned: { easy: 0, medium: 0, hard: 1 } })?.code,
    ).toBe("pinned_exceeds_mix");
  });

  it("suggestMix reserves pinned difficulties", () => {
    const r = suggestMix({
      problemCount: 4,
      rates: PRIOR_RATES,
      available: { easy: 5, medium: 5, hard: 0 },
      pinned: { easy: 0, medium: 0, hard: 2 },
    });
    if (!r.ok) throw new Error(r.code);
    expect(r.mix.hard).toBe(2);
  });
});

describe("Example D: tiers", () => {
  const oct3 = new Date("2026-10-03T18:00:00Z");
  const medium = [
    candidate("merge-intervals", "medium"),
    candidate("house-robber", "medium", { solvedBy: 1 }),
    candidate("coin-change", "medium", { lastUsedAt: oct3 }),
  ];

  it("draw → A, re-roll → B (1 solver), re-roll → C, then the re-roll list resets", () => {
    for (const seed of [1, 2, 3, 42]) {
      const rng = createSeededRng(seed);
      const first = drawSlots({ problemCount: 1, mix: { easy: 0, medium: 1, hard: 0 }, pool: medium, avoidSolved: true, rng });
      if (!first.ok) throw new Error(first.code);
      expect(first.slots[0]).toMatchObject({ problemId: "merge-intervals", tier: "A" });

      const second = rerollSlot({ slots: first.slots, position: 1, pool: medium, rerolledIds: first.rerolledIds, rerollCount: 0, avoidSolved: true, rng });
      if (!second.ok) throw new Error(second.code);
      expect(second.slots[0]).toMatchObject({ problemId: "house-robber", tier: "B", solvedBy: 1 });

      const third = rerollSlot({ slots: second.slots, position: 1, pool: medium, rerolledIds: second.rerolledIds, rerollCount: second.rerollCount, avoidSolved: true, rng });
      if (!third.ok) throw new Error(third.code);
      expect(third.slots[0]).toMatchObject({ problemId: "coin-change", tier: "C", lastUsedAt: oct3 });
      expect(third.rerollCount).toBe(2);
      expect(third.notices).toEqual([]);

      const fourth = rerollSlot({ slots: third.slots, position: 1, pool: medium, rerolledIds: third.rerolledIds, rerollCount: third.rerollCount, avoidSolved: true, rng });
      if (!fourth.ok) throw new Error(fourth.code);
      expect(fourth.notices).toEqual([{ code: "rerolls_reset", difficulty: "medium" }]);
      expect(fourth.slots[0].problemId).toBe("merge-intervals");
      expect(fourth.rerolledIds).toEqual(["coin-change"]);
    }
  });

  it("B is ordered by solver count, C by last use (oldest first)", () => {
    const rng = createSeededRng(7);
    const bPool = [candidate("b2", "easy", { solvedBy: 2 }), candidate("b1", "easy", { solvedBy: 1 }), candidate("b3", "easy", { solvedBy: 3 })];
    const cPool = [
      candidate("c-new", "easy", { lastUsedAt: new Date("2026-10-10T00:00:00Z") }),
      candidate("c-old", "easy", { lastUsedAt: new Date("2026-09-01T00:00:00Z") }),
    ];
    const pick = (p: CandidateProblem[]) => {
      const r = drawSlots({ problemCount: 1, mix: { easy: 1, medium: 0, hard: 0 }, pool: p, avoidSolved: true, rng });
      if (!r.ok) throw new Error(r.code);
      return r.slots[0].problemId;
    };
    expect(pick(bPool)).toBe("b1");
    expect(pick(cPool)).toBe("c-old");
    expect(pick([...cPool, ...bPool])).toBe("b1");
  });

  it("avoidSolved=false merges A and B (only room usage matters)", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const r = drawSlots({ problemCount: 1, mix: { easy: 0, medium: 1, hard: 0 }, pool: medium, avoidSolved: false, rng: createSeededRng(seed) });
      if (!r.ok) throw new Error(r.code);
      seen.add(r.slots[0].problemId);
    }
    expect([...seen].sort()).toEqual(["house-robber", "merge-intervals"]);
  });

  it("unused counts per difficulty", () => {
    expect(unusedCounts(medium)).toEqual({ easy: 0, medium: 2, hard: 0 });
  });
});

describe("drawSlots", () => {
  it("fills free positions Easy, then Medium, then Hard", () => {
    const r = drawSlots({ problemCount: 4, mix: { easy: 1, medium: 2, hard: 1 }, pool: pool(BIG), avoidSolved: true, rng: createSeededRng(3) });
    if (!r.ok) throw new Error(r.code);
    expect(r.slots.map((s) => s.difficulty)).toEqual(["easy", "medium", "medium", "hard"]);
    expect(r.slots.map((s) => s.position)).toEqual([1, 2, 3, 4]);
  });

  it("keeps pinned slots and lets them consume their difficulty", () => {
    const pinned: Slot[] = [{ position: 1, problemId: "h3", difficulty: "hard", pinned: true }];
    const r = drawSlots({ problemCount: 4, mix: { easy: 1, medium: 2, hard: 1 }, pool: pool(BIG), pinned, avoidSolved: true, rng: createSeededRng(3) });
    if (!r.ok) throw new Error(r.code);
    expect(r.slots[0]).toMatchObject({ position: 1, problemId: "h3", pinned: true });
    expect(r.slots.slice(1).map((s) => s.difficulty)).toEqual(["easy", "medium", "medium"]);
    expect(actualMix(r.slots)).toEqual({ easy: 1, medium: 2, hard: 1 });
  });

  it("moves a pin beyond a lowered N to the lowest free position", () => {
    const pinned: Slot[] = [{ position: 4, problemId: "m1", difficulty: "medium", pinned: true }];
    const r = drawSlots({ problemCount: 2, mix: { easy: 1, medium: 1, hard: 0 }, pool: pool(BIG), pinned, avoidSolved: true, rng: createSeededRng(1) });
    if (!r.ok) throw new Error(r.code);
    expect(r.slots.map((s) => [s.position, s.difficulty, s.pinned])).toEqual([
      [1, "medium", true],
      [2, "easy", false],
    ]);
  });

  it("skips re-rolled problems until the difficulty is exhausted, then says so", () => {
    const p = pool({ easy: 2, medium: 0, hard: 0 });
    const r = drawSlots({ problemCount: 1, mix: { easy: 1, medium: 0, hard: 0 }, pool: p, rerolledIds: ["e1"], avoidSolved: true, rng: createSeededRng(1) });
    expect(r.ok && r.slots[0].problemId).toBe("e2");
    const all = drawSlots({ problemCount: 1, mix: { easy: 1, medium: 0, hard: 0 }, pool: p, rerolledIds: ["e1", "e2", "other"], avoidSolved: true, rng: createSeededRng(1) });
    if (!all.ok) throw new Error(all.code);
    expect(all.notices).toEqual([{ code: "rerolls_reset", difficulty: "easy" }]);
    expect(all.rerolledIds).toEqual(["other"]);
  });

  it("is reproducible for a seed", () => {
    const args = { problemCount: 4, mix: { easy: 1, medium: 2, hard: 1 }, pool: pool(BIG), avoidSolved: true } as const;
    const a = drawSlots({ ...args, rng: createSeededRng(99) });
    const b = drawSlots({ ...args, rng: createSeededRng(99) });
    const c = drawSlots({ ...args, pool: [...pool(BIG)].reverse(), rng: createSeededRng(99) });
    expect(a).toEqual(b);
    expect(a).toEqual(c);
  });
});

describe("re-roll, re-roll all, pin", () => {
  const p = pool(BIG);
  const start = () => {
    const r = drawSlots({ problemCount: 4, mix: { easy: 1, medium: 2, hard: 1 }, pool: p, avoidSolved: true, rng: createSeededRng(5) });
    if (!r.ok) throw new Error(r.code);
    return r;
  };

  it("re-roll keeps the difficulty and never duplicates", () => {
    const s = start();
    const r = rerollSlot({ slots: s.slots, position: 2, pool: p, rerolledIds: [], rerollCount: 0, avoidSolved: true, rng: createSeededRng(1) });
    if (!r.ok) throw new Error(r.code);
    expect(r.slots[1].difficulty).toBe("medium");
    expect(r.slots[1].problemId).not.toBe(s.slots[1].problemId);
    expect(new Set(r.slots.map((x) => x.problemId)).size).toBe(4);
    expect(r.rerolledIds).toEqual([s.slots[1].problemId]);
  });

  it("re-roll #31 → reroll_limit; pinned slot → slot_pinned; unknown slot → slot_not_found", () => {
    const s = start();
    const base = { slots: s.slots, pool: p, rerolledIds: [], avoidSolved: true, rng: createSeededRng(1) };
    expect(rerollSlot({ ...base, position: 1, rerollCount: 30 })).toEqual({ ok: false, code: "reroll_limit" });
    expect(rerollSlot({ ...base, position: 1, rerollCount: 29 }).ok).toBe(true);
    const pinned = s.slots.map((x) => (x.position === 1 ? { ...x, pinned: true } : x));
    expect(rerollSlot({ ...base, slots: pinned, position: 1, rerollCount: 0 })).toEqual({ ok: false, code: "slot_pinned" });
    expect(rerollSlot({ ...base, position: 9, rerollCount: 0 })).toEqual({ ok: false, code: "slot_not_found" });
  });

  it("re-roll with no other problem of the difficulty → no_candidates", () => {
    const tiny = pool({ easy: 1, medium: 0, hard: 0 });
    const slots: Slot[] = [{ position: 1, problemId: "e1", difficulty: "easy", pinned: false }];
    expect(rerollSlot({ slots, position: 1, pool: tiny, rerolledIds: [], rerollCount: 0, avoidSolved: true, rng: createSeededRng(1) })).toEqual({
      ok: false,
      code: "no_candidates",
    });
  });

  it("re-roll all leaves pinned slots untouched", () => {
    const s = start();
    const freeHard = p.find((c) => c.difficulty === "hard" && !s.slots.some((x) => x.problemId === c.id))!;
    const pinnedSlots = pinSlot(s.slots, 3, { id: freeHard.id, difficulty: "hard" });
    if (!pinnedSlots.ok) throw new Error(pinnedSlots.code);
    for (let seed = 0; seed < 20; seed++) {
      const r = rerollAll({
        problemCount: 4,
        mix: actualMix(pinnedSlots.slots),
        slots: pinnedSlots.slots,
        pool: p,
        rerolledIds: [],
        rerollCount: 0,
        avoidSolved: true,
        rng: createSeededRng(seed),
      });
      if (!r.ok) throw new Error(r.code);
      expect(r.slots[2]).toMatchObject({ position: 3, problemId: freeHard.id, pinned: true });
      expect(r.rerollCount).toBe(1);
      expect(new Set(r.slots.map((x) => x.problemId)).size).toBe(4);
    }
  });

  it("pin: duplicate → duplicate_problem; difficulty follows the problem; unpin keeps it", () => {
    const s = start();
    expect(pinSlot(s.slots, 1, { id: s.slots[2].problemId, difficulty: "medium" })).toEqual({ ok: false, code: "duplicate_problem" });
    const pinned = pinSlot(s.slots, 1, { id: "h3", difficulty: "hard" });
    if (!pinned.ok) throw new Error(pinned.code);
    expect(actualMix(pinned.slots)).toEqual({ easy: 0, medium: 2, hard: 2 });
    const unpinned = unpinSlot(pinned.slots, 1);
    expect(unpinned.ok && unpinned.slots[0]).toMatchObject({ problemId: "h3", pinned: false });
    expect(pinSlot(s.slots, 9, { id: "x", difficulty: "easy" })).toEqual({ ok: false, code: "slot_not_found" });
  });
});

describe("expected participants", () => {
  it("joined if at least 2, else all members", () => {
    expect(expectedParticipants(["a", "b"], ["a", "b", "c"])).toEqual(["a", "b"]);
    expect(expectedParticipants(["a"], ["a", "b", "c"])).toEqual(["a", "b", "c"]);
  });
});
