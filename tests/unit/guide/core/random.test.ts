import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { mulberry32, pick, randomInt, seededShuffle } from "@/lib/guide/random";
import { numRuns } from "@/lib/guide/testing/fc";

describe("mulberry32", () => {
  it("is deterministic per seed and differs between seeds", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const xs = Array.from({ length: 5 }, () => a());
    expect(Array.from({ length: 5 }, () => b())).toEqual(xs);
    expect(Array.from({ length: 5 }, () => c())).not.toEqual(xs);
  });
  it("stays in [0, 1)", () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const rng = mulberry32(seed);
        for (let i = 0; i < 20; i++) {
          const x = rng();
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(1);
        }
      }),
      { numRuns: numRuns(100) },
    );
  });
});

describe("helpers", () => {
  it("randomInt is inclusive and in range", () => {
    const rng = mulberry32(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const x = randomInt(rng, 1, 3);
      expect(x).toBeGreaterThanOrEqual(1);
      expect(x).toBeLessThanOrEqual(3);
      seen.add(x);
    }
    expect(seen).toEqual(new Set([1, 2, 3]));
    expect(() => randomInt(rng, 3, 1)).toThrow(RangeError);
  });
  it("seededShuffle is a deterministic permutation and leaves the input alone", () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), fc.integer(), (xs, seed) => {
        const copy = xs.slice();
        const s1 = seededShuffle(xs, mulberry32(seed));
        expect(xs).toEqual(copy);
        expect(seededShuffle(xs, mulberry32(seed))).toEqual(s1);
        expect(s1.slice().sort((p, q) => p - q)).toEqual(copy.slice().sort((p, q) => p - q));
      }),
      { numRuns: numRuns(100) },
    );
  });
  it("pick returns an element and rejects empty arrays", () => {
    expect(["a", "b"]).toContain(pick(["a", "b"], mulberry32(5)));
    expect(() => pick([], mulberry32(5))).toThrow(RangeError);
  });
});
