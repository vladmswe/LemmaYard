// Property tests (fast-check) for the rooms domain core.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { decodeCursor, encodeCursor } from "@/lib/rooms/events";
import { createSeededRng } from "@/lib/rooms/rng";
import { participantTotals, rankParticipants, scoreSession, type ScoringParticipant } from "@/lib/rooms/scoring";
import {
  checkMix,
  drawSlots,
  rerollAll,
  suggestMix,
  type CandidateProblem,
} from "@/lib/rooms/selection";
import { DIFFICULTIES, mixOf, mixTotal, type Mix } from "@/lib/rooms/types";

const cellArb = (position: number) =>
  fc.record({
    position: fc.constant(position),
    wrongBefore: fc.integer({ min: 0, max: 5 }),
    solveSeconds: fc.option(fc.integer({ min: 0, max: 5400 }), { nil: null }),
  });

const participantsArb = fc
  .integer({ min: 1, max: 8 })
  .chain((count) =>
    fc.tuple(
      ...Array.from({ length: count }, (_, i) =>
        fc.record({
          userId: fc.constant(`u${i}`),
          username: fc.constant(`user_${i}`),
          cells: fc.tuple(cellArb(1), cellArb(2), cellArb(3), cellArb(4)),
        }),
      ),
    ),
  ) as fc.Arbitrary<ScoringParticipant[]>;

const rankOf = (ps: ScoringParticipant[], userId: string) =>
  scoreSession(ps).participants.find((p) => p.userId === userId)!.rank;

describe("scoring properties", () => {
  it("solving an unsolved problem never makes your rank worse", () => {
    fc.assert(
      fc.property(participantsArb, fc.nat(), fc.integer({ min: 0, max: 5400 }), (ps, pick, secs) => {
        const who = ps[pick % ps.length];
        const unsolved = who.cells.find((c) => c.solveSeconds === null);
        if (!unsolved) return;
        const before = rankOf(ps, who.userId);
        const changed = ps.map((p) =>
          p.userId !== who.userId
            ? p
            : { ...p, cells: p.cells.map((c) => (c === unsolved ? { ...c, solveSeconds: secs } : c)) },
        );
        expect(rankOf(changed, who.userId)).toBeLessThanOrEqual(before);
      }),
    );
  });

  it("an extra wrong attempt before a solve never improves your rank", () => {
    fc.assert(
      fc.property(participantsArb, fc.nat(), (ps, pick) => {
        const who = ps[pick % ps.length];
        const solved = who.cells.find((c) => c.solveSeconds !== null);
        if (!solved) return;
        const before = rankOf(ps, who.userId);
        const changed = ps.map((p) =>
          p.userId !== who.userId
            ? p
            : { ...p, cells: p.cells.map((c) => (c === solved ? { ...c, wrongBefore: c.wrongBefore + 1 } : c)) },
        );
        expect(rankOf(changed, who.userId)).toBeGreaterThanOrEqual(before);
        expect(participantTotals(changed.find((p) => p.userId === who.userId)!.cells).penaltySec).toBe(
          participantTotals(who.cells).penaltySec + 300,
        );
      }),
    );
  });

  it("rank = 1 + number strictly better; ties share a rank; input order does not matter", () => {
    const rowsArb = fc.array(
      fc.record({ solvedCount: fc.integer({ min: 0, max: 3 }), penaltySec: fc.integer({ min: 0, max: 3 }).map((x) => x * 100) }),
      { minLength: 1, maxLength: 10 },
    );
    fc.assert(
      fc.property(rowsArb, fc.integer(), (raw, seed) => {
        const rows = raw.map((r, i) => ({ ...r, userId: `u${i}`, username: `user_${i}` }));
        const ranked = rankParticipants(rows);
        for (const r of ranked) {
          const better = rows.filter(
            (o) => o.solvedCount > r.solvedCount || (o.solvedCount === r.solvedCount && o.penaltySec < r.penaltySec),
          ).length;
          expect(r.rank).toBe(better + 1);
        }
        // Ranks non-decreasing in listed order.
        for (let i = 1; i < ranked.length; i++) expect(ranked[i].rank).toBeGreaterThanOrEqual(ranked[i - 1].rank);
        const rng = createSeededRng(seed);
        const shuffled = [...rows].sort(() => rng() - 0.5);
        expect(rankParticipants(shuffled)).toEqual(ranked);
      }),
    );
  });
});

const poolArb = fc
  .record({
    easy: fc.integer({ min: 0, max: 8 }),
    medium: fc.integer({ min: 0, max: 8 }),
    hard: fc.integer({ min: 0, max: 5 }),
  })
  .chain((counts) =>
    fc.tuple(
      ...DIFFICULTIES.flatMap((d) =>
        Array.from({ length: counts[d] }, (_, i) =>
          fc.record({
            id: fc.constant(`${d}-${i}`),
            difficulty: fc.constant(d),
            lastUsedAt: fc.option(fc.integer({ min: 0, max: 10 }).map((x) => new Date(Date.UTC(2026, 0, 1 + x))), { nil: null }),
            solvedBy: fc.integer({ min: 0, max: 3 }),
          }),
        ),
      ),
    ),
  ) as fc.Arbitrary<CandidateProblem[]>;

const mixArb = (n: number) =>
  fc
    .tuple(fc.integer({ min: 0, max: n }), fc.integer({ min: 0, max: n }))
    .map(([a, b]): Mix => {
      const easy = Math.min(a, n);
      const medium = Math.min(b, n - easy);
      return { easy, medium, hard: n - easy - medium };
    });

describe("selection properties", () => {
  const caseArb = fc
    .integer({ min: 1, max: 8 })
    .chain((n) => fc.record({ n: fc.constant(n), mix: mixArb(n), pool: poolArb, seed: fc.integer(), avoidSolved: fc.boolean() }));

  it("a successful draw has no duplicates, matches the mix and sums to N; errors only when infeasible", () => {
    fc.assert(
      fc.property(caseArb, ({ n, mix, pool, seed, avoidSolved }) => {
        const r = drawSlots({ problemCount: n, mix, pool, avoidSolved, rng: createSeededRng(seed) });
        const feasible = checkMix({ problemCount: n, mix, available: mixOf(pool) }) === null;
        expect(r.ok).toBe(feasible);
        if (!r.ok) return;
        expect(new Set(r.slots.map((s) => s.problemId)).size).toBe(n);
        expect(mixOf(r.slots)).toEqual(mix);
        expect(r.slots.map((s) => s.position)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
        for (const s of r.slots) expect(pool.find((c) => c.id === s.problemId)?.difficulty).toBe(s.difficulty);
      }),
    );
  });

  it("is deterministic for a given seed", () => {
    fc.assert(
      fc.property(caseArb, ({ n, mix, pool, seed, avoidSolved }) => {
        const a = drawSlots({ problemCount: n, mix, pool, avoidSolved, rng: createSeededRng(seed) });
        const b = drawSlots({ problemCount: n, mix, pool: [...pool].reverse(), avoidSolved, rng: createSeededRng(seed) });
        expect(a).toEqual(b);
      }),
    );
  });

  it("re-roll all keeps pinned slots, never duplicates and keeps the mix", () => {
    fc.assert(
      fc.property(caseArb, fc.integer(), ({ n, mix, pool, seed, avoidSolved }, seed2) => {
        const first = drawSlots({ problemCount: n, mix, pool, avoidSolved, rng: createSeededRng(seed) });
        if (!first.ok) return;
        const slots = first.slots.map((s, i) => ({ ...s, pinned: i % 2 === 0 }));
        const r = rerollAll({ problemCount: n, mix, slots, pool, rerolledIds: [], rerollCount: 0, avoidSolved, rng: createSeededRng(seed2) });
        if (!r.ok) throw new Error(r.code);
        expect(new Set(r.slots.map((s) => s.problemId)).size).toBe(n);
        expect(mixOf(r.slots)).toEqual(mix);
        for (const s of slots.filter((x) => x.pinned)) {
          expect(r.slots.find((x) => x.position === s.position)?.problemId).toBe(s.problemId);
        }
      }),
    );
  });

  it("the suggested mix sums to N and is feasible whenever the pool is large enough", () => {
    const rate = fc.double({ min: 0, max: 1, noNaN: true });
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.record({ easy: rate, medium: rate, hard: rate }),
        fc.record({ easy: fc.nat(8), medium: fc.nat(8), hard: fc.nat(8) }),
        fc.constantFrom("relaxed", "balanced", "tough" as const),
        (n, rates, available, challenge) => {
          const r = suggestMix({ problemCount: n, rates, available, challenge });
          if (mixTotal(available) < n) {
            expect(r).toMatchObject({ ok: false, code: "pool_too_small" });
            return;
          }
          if (!r.ok) throw new Error(r.code);
          expect(mixTotal(r.mix)).toBe(n);
          expect(checkMix({ problemCount: n, mix: r.mix, available })).toBeNull();
        },
      ),
    );
  });
});

describe("cursor property", () => {
  it("encode/decode round-trips every non-negative bigint", () => {
    fc.assert(
      fc.property(fc.bigInt({ min: BigInt(0), max: BigInt("9223372036854775807") }), (id) => {
        expect(decodeCursor(encodeCursor(id))).toBe(id);
      }),
    );
  });
});
