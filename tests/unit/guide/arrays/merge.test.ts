import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { twoPointersMerge } from "@/components/guide/viz/twopointers/defs";
import { MergeRenderer } from "@/components/guide/viz/twopointers/MergeRenderer";
import { MAX_FRAMES, type Frame } from "@/lib/guide/contracts";
import { numRuns } from "@/lib/guide/testing/fc";
import { expectTraceValid } from "@/lib/guide/testing/trace-invariants";
import {
  MERGE_MAX,
  MERGE_MAX_EACH,
  MERGE_MIN,
  MERGE_PRESETS,
  mergeModel,
  mergeTable,
  randomMergeInput,
  type MergeInput,
  type MergeState,
} from "@/lib/guide/traces/twopointers";
import { mergeRef, sameMultiset } from "@/lib/guide/traces/twopointers/reference";

import { checkRenderer } from "../complexity-basics/render-check";

const model = mergeModel;

const sortedArb = fc
  .array(fc.integer({ min: MERGE_MIN, max: MERGE_MAX }), { maxLength: MERGE_MAX_EACH })
  .map((a) => a.sort((x, y) => x - y));
const inputArb: fc.Arbitrary<MergeInput> = fc
  .record({ a: sortedArb, b: sortedArb })
  .filter((v) => v.a.length + v.b.length > 0);

/** Output so far is sorted and is exactly the consumed prefixes A[0..i) and B[0..j). */
function checkFrames(input: MergeInput, frames: readonly Frame<MergeState>[]) {
  for (const f of frames) {
    const { c, i, j } = f.state;
    const filled = c.filter((x) => x !== null).map((x) => x.value);
    expect(c.slice(0, i + j).every((x) => x !== null)).toBe(true);
    expect(filled).toHaveLength(i + j);
    for (let k = 1; k < filled.length; k++) expect(filled[k]!).toBeGreaterThanOrEqual(filled[k - 1]!);
    expect(sameMultiset(filled, [...input.a.slice(0, i), ...input.b.slice(0, j)])).toBe(true);
  }
}

describe("twopointers.merge (S1: generator contract)", () => {
  it("default input and every preset", () => {
    for (const input of [model.defaultInput, ...MERGE_PRESETS.map((p) => p.value)]) {
      expectTraceValid(model.generate(input), model, { input });
    }
  });

  it("200 random inputs (property), up to 8 + 8 values", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const t = model.generate(input);
        expectTraceValid(t, model, { input });
        expect(t.frames.length).toBeLessThanOrEqual(MAX_FRAMES);
      }),
      { numRuns: numRuns(200) },
    );
  });
});

describe("twopointers.merge (S2: reference agreement and per-frame invariants)", () => {
  it("C equals sort(A + B); every frame's output is sorted and a merge of the used prefixes", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const t = model.generate(input);
        expect(t.result).toEqual(mergeRef(input.a, input.b));
        expect(t.frames.at(-1)?.counters.writes).toBe(input.a.length + input.b.length);
        checkFrames(input, t.frames);
      }),
      { numRuns: numRuns(200) },
    );
  });
});

describe("AC-G-2-12 (S3): the course example", () => {
  it("A = [1, 3, 5, 8, 10], B = [2, 6, 7, 9, 13] gives C = [1, 2, 3, 5, 6, 7, 8, 9, 10, 13] with 10 writes", () => {
    const t = model.generate({ a: [1, 3, 5, 8, 10], b: [2, 6, 7, 9, 13] });
    expect(t.result).toEqual([1, 2, 3, 5, 6, 7, 8, 9, 10, 13]);
    expect(t.frames.at(-1)?.counters).toEqual({ comparisons: 9, writes: 10 });
    const ran = t.frames.find((f) => f.state.ranOut !== null)!;
    expect(ran.phase).toBe("A ran out");
    expect(ran.narration).toMatch(/^A is empty \(i = 5 = len\(A\)\)/);
    expect(ran.line).toBe("merge.restB");
    expect(t.frames.find((f) => f.prompt)?.prompt).toMatchObject({ id: "merge-next", answerId: "b" });
  });

  it("when B runs out first, the narration names B", () => {
    const t = model.generate({ a: [4, 9, 12, 20], b: [1, 5, 7] });
    const ran = t.frames.find((f) => f.state.ranOut !== null)!;
    expect(ran.narration).toMatch(/^B is empty/);
    expect(ran.line).toBe("merge.restA");
    expect(t.result).toEqual([1, 4, 5, 7, 9, 12, 20]);
  });

  it("ties take from A first; an empty list is copied over at once", () => {
    const tie = model.generate({ a: [4], b: [4] });
    expect(tie.frames.find((f) => f.line === "merge.takeA")?.state.c[0]?.id).toBe("c0");
    const empty = model.generate({ a: [], b: [3, 6, 9] });
    expect(empty.frames.map((f) => f.phase)).toEqual(["Start", "A ran out", "Copy the rest", "Copy the rest", "Copy the rest", "Merged"]);
  });
});

describe("twopointers.merge input", () => {
  const spec = model.input!;
  it("parse(format(v)) equals v", () => {
    for (const v of [model.defaultInput, ...MERGE_PRESETS.map((p) => p.value), randomMergeInput(4)]) {
      expect(spec.parse(spec.format(v))).toEqual({ ok: true, value: v });
    }
    fc.assert(
      fc.property(inputArb, (v) => {
        expect(spec.parse(spec.format(v))).toEqual({ ok: true, value: v });
        expect(spec.format(v).length).toBeLessThanOrEqual(spec.maxLength);
      }),
      { numRuns: numRuns(200) },
    );
  });

  it("rejects unsorted or empty input with a message", () => {
    expect(spec.parse("3, 1; 2")).toEqual({ ok: false, error: "A: sort it from small to large (1 comes after 3)" });
    expect(spec.parse(";")).toEqual({ ok: false, error: "Enter at least one number in A or B" });
    expect(spec.parse("1, 2")).toMatchObject({ ok: false });
  });
});

describe("twopointers.merge text alternatives and defs", () => {
  it("describe() and toTable() show A, B and C", () => {
    const s = model.generate(model.defaultInput).frames.at(-1)!.state;
    expect(model.describe(s)).toContain("C so far: 1, 2, 3, 5, 6, 7, 8, 9, 10, 13 (10 of 10)");
    expect(mergeTable(s).rows[0]).toEqual([0, "1 (used)", "2 (used)", 1]);
    expect(twoPointersMerge.model).toBe(model);
  });
});

describe("AC-G-2-15: MergeRenderer static markup", () => {
  it("every frame of every preset at 288/390/640/1040 px and as a thumbnail", () => {
    const big = [-99, 0, 100, 200, 300, 400, 500, 999];
    const inputs = [model.defaultInput, ...MERGE_PRESETS.map((p) => p.value), { a: big, b: big }, { a: [5], b: [] }];
    expect(checkRenderer(model, MergeRenderer, inputs)).toEqual([]);
  }, 30_000);
});
