import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { SearchRenderer } from "@/components/guide/viz/search/SearchRenderer";
import { searchBinary, searchLinear } from "@/components/guide/viz/search/defs";
import { MAX_FRAMES, type Frame } from "@/lib/guide/contracts";
import { numRuns } from "@/lib/guide/testing/fc";
import { expectTraceValid } from "@/lib/guide/testing/trace-invariants";
import {
  randomSearchInput,
  SEARCH_MAX,
  SEARCH_MAX_VALUES,
  SEARCH_MIN,
  SEARCH_PRESETS,
  searchBinaryModel,
  searchLinearModel,
  searchTable,
  type SearchInput,
  type SearchState,
} from "@/lib/guide/traces/search";
import { ARRAY_32 } from "@/lib/guide/traces/search/presets";
import { binarySearchRef, linearSearchRef, lowerBoundRef } from "@/lib/guide/traces/search/reference";

import { checkRenderer } from "./render-check";

const MODELS = [searchLinearModel, searchBinaryModel] as const;

const sortedArb = fc
  .array(fc.integer({ min: SEARCH_MIN, max: SEARCH_MAX }), { minLength: 1, maxLength: SEARCH_MAX_VALUES })
  .map((a) => a.sort((x, y) => x - y));

const inputArb = (op?: "linear" | "binary") =>
  sortedArb.chain((values) =>
    fc.record({
      op: op ? fc.constant(op) : fc.constantFrom("linear" as const, "binary" as const),
      values: fc.constant(values),
      target: fc.oneof(fc.constantFrom(...values), fc.integer({ min: SEARCH_MIN, max: SEARCH_MAX })),
    }),
  );

/** Per-frame invariants of section 3.3: lo <= hi, the range holds the lower bound, a found index holds the target. */
function checkFrames(input: SearchInput, frames: readonly Frame<SearchState>[]) {
  const lb = lowerBoundRef(input.values, input.target);
  for (const f of frames) {
    const s = f.state;
    if (s.lo !== null && s.hi !== null) {
      expect(s.lo).toBeLessThanOrEqual(s.hi);
      expect(s.lo).toBeLessThanOrEqual(lb);
      expect(lb).toBeLessThanOrEqual(s.hi);
    }
    if (s.result !== null && s.result !== -1) expect(input.values[s.result]).toBe(input.target);
    if (s.at !== null) expect(s.at).toBeGreaterThanOrEqual(0);
  }
}

describe("search models (S1: generator contract)", () => {
  it.each(MODELS)("$id: default input and every preset", (model) => {
    for (const input of [model.defaultInput, ...SEARCH_PRESETS.map((p) => p.value)]) {
      expectTraceValid(model.generate(input), model, { input });
    }
  });

  it.each(MODELS)("$id: 200 random inputs (property), including n = 32", (model) => {
    fc.assert(
      fc.property(inputArb(), (input) => {
        const t = model.generate(input);
        expectTraceValid(t, model, { input });
        expect(t.frames.length).toBeLessThanOrEqual(MAX_FRAMES);
      }),
      { numRuns: numRuns(200) },
    );
  });

  it("default traces carry 1..3 prompts and are fast", () => {
    for (const model of MODELS) {
      model.generate(model.defaultInput); // warm-up (JIT), as on a running server
      const t0 = performance.now();
      const t = model.generate(model.defaultInput);
      expect(performance.now() - t0).toBeLessThan(20);
      const prompts = t.frames.filter((f) => f.prompt).length;
      expect(prompts).toBeGreaterThanOrEqual(1);
      expect(prompts).toBeLessThanOrEqual(3);
    }
  });

  it("both models generate either search from the op in the input", () => {
    const input = { ...searchLinearModel.defaultInput, op: "binary" as const };
    expect(searchLinearModel.generate(input)).toEqual(searchBinaryModel.generate(input));
    expect(searchLinearModel.lineIds).toEqual(searchBinaryModel.lineIds);
  });
});

describe("search models (S2: reference agreement and per-frame invariants)", () => {
  it("linear: result and comparisons equal the reference scan; frames keep the invariants", () => {
    fc.assert(
      fc.property(inputArb("linear"), (input) => {
        const t = searchLinearModel.generate(input);
        const ref = linearSearchRef(input.values, input.target);
        expect(t.result).toBe(ref.index);
        expect(t.frames.at(-1)?.state.result).toBe(ref.index);
        expect(t.frames.at(-1)?.counters.comparisons).toBe(ref.comparisons);
        checkFrames(input, t.frames);
      }),
      { numRuns: numRuns(200) },
    );
  });

  it("binary: result equals bisect_left-or--1; every frame's [lo, hi) contains the lower bound", () => {
    fc.assert(
      fc.property(inputArb("binary"), (input) => {
        const t = searchBinaryModel.generate(input);
        expect(t.result).toBe(binarySearchRef(input.values, input.target));
        expect(t.frames.at(-1)?.state.result).toBe(t.result);
        checkFrames(input, t.frames);
      }),
      { numRuns: numRuns(200) },
    );
  });
});

describe("search models (S3: golden examples)", () => {
  it("linear default: n = 32, target 60 absent, 32 comparisons, fast-forward frame and two prompts", () => {
    const t = searchLinearModel.generate(searchLinearModel.defaultInput);
    expect(t.frames.map((f) => f.phase)).toEqual(["Start", "Compare", "Compare", "Compare", "Keep comparing", "Not found"]);
    expect(t.frames.map((f) => f.counters.comparisons)).toEqual([0, 1, 2, 3, 32, 32]);
    expect(t.result).toBe(-1);
    expect(t.frames[3]?.prompt).toMatchObject({ id: "linear-stop", answerId: "no" });
    expect(t.frames[4]?.prompt).toMatchObject({ id: "linear-total", answerId: "n32" });
    expect(t.frames[4]?.prompt?.choices.map((c) => c.label)).toEqual(["6", "16", "29", "32"]);
  });

  it("binary default: target 71 found at index 23 after 6 comparisons", () => {
    const t = searchBinaryModel.generate(searchBinaryModel.defaultInput);
    const rounds = t.frames.filter((f) => f.line === "search.binary.compare").map((f) => f.state.at);
    expect(rounds).toEqual([16, 24, 20, 22, 23]);
    const ranges = t.frames
      .filter((f) => f.line === "search.binary.right" || f.line === "search.binary.left")
      .map((f) => [f.state.lo, f.state.hi]);
    expect(ranges).toEqual([
      [17, 32],
      [17, 24],
      [21, 24],
      [23, 24],
      [23, 23],
    ]);
    expect(t.frames.at(-1)).toMatchObject({ phase: "Found", line: "search.binary.found", counters: { comparisons: 6 } });
    expect(t.result).toBe(23);
    expect(t.frames.find((f) => f.prompt?.id === "binary-next-index")?.prompt?.answerId).toBe("i24");
    expect(t.frames.find((f) => f.prompt?.id === "binary-half")?.prompt?.answerId).toBe("right");
  });

  it("binary returns the first index of a repeated value, and -1 past the end", () => {
    expect(searchBinaryModel.generate({ op: "binary", values: [2, 3, 3, 3, 6, 8, 8, 9], target: 3 }).result).toBe(1);
    expect(searchBinaryModel.generate({ op: "binary", values: [2, 3, 3, 3, 6, 8, 8, 9], target: 8 }).result).toBe(5);
    const past = searchBinaryModel.generate({ op: "binary", values: [2, 3, 5], target: 9 });
    expect(past.result).toBe(-1);
    expect(past.frames.at(-1)?.counters.comparisons).toBe(2); // no final check when lo = n
  });

  it("linear with the target at index 0 stops after one comparison", () => {
    const t = searchLinearModel.generate({ op: "linear", values: [2, 5, 9, 14, 17, 21, 26, 30, 35], target: 2 });
    expect(t.frames.map((f) => f.phase)).toEqual(["Start", "Compare", "Found"]);
    expect(t.result).toBe(0);
  });
});

describe("AC-G-2-10: binary search index and comparison bound", () => {
  it("500 random sorted arrays: index from bisect_left (or -1), comparisons <= ceil(log2(n + 1)) + 1", () => {
    fc.assert(
      fc.property(inputArb("binary"), (input) => {
        const t = searchBinaryModel.generate(input);
        const n = input.values.length;
        expect(t.result).toBe(binarySearchRef(input.values, input.target));
        expect(t.frames.at(-1)!.counters.comparisons!).toBeLessThanOrEqual(Math.ceil(Math.log2(n + 1)) + 1);
      }),
      { numRuns: numRuns(500) },
    );
  });

  it("n = 32 with an absent target: linear shows 32 comparisons, binary at most 7", () => {
    expect(ARRAY_32).toHaveLength(32);
    for (const target of [0, 60, 97]) {
      const lin = searchLinearModel.generate({ op: "linear", values: ARRAY_32, target });
      expect(lin.frames.at(-1)?.counters.comparisons).toBe(32);
      const bin = searchBinaryModel.generate({ op: "binary", values: ARRAY_32, target });
      expect(bin.frames.at(-1)!.counters.comparisons!).toBeLessThanOrEqual(7);
    }
  });
});

describe("search input", () => {
  const spec = searchLinearModel.input!;

  it("parse(format(v)) equals v for defaults, presets and random inputs", () => {
    const values = [
      searchLinearModel.defaultInput,
      searchBinaryModel.defaultInput,
      ...SEARCH_PRESETS.map((p) => p.value),
      randomSearchInput(3, "linear"),
      randomSearchInput(4, "binary"),
    ];
    for (const v of values) expect(spec.parse(spec.format(v))).toEqual({ ok: true, value: v });
    fc.assert(
      fc.property(inputArb(), (v) => {
        expect(spec.parse(spec.format(v))).toEqual({ ok: true, value: v });
        expect(spec.format(v).length).toBeLessThanOrEqual(spec.maxLength);
      }),
      { numRuns: numRuns(200) },
    );
  });

  it("random inputs are sorted and within the caps", () => {
    for (let seed = 0; seed < 50; seed++) {
      const v = randomSearchInput(seed, "binary");
      expect(spec.parse(spec.format(v)).ok).toBe(true);
    }
  });

  it("uses the model's op when the prefix is left out", () => {
    expect(searchBinaryModel.input!.parse("1, 2, 3; 2")).toMatchObject({ ok: true, value: { op: "binary" } });
    expect(spec.parse("1, 2, 3; 2")).toMatchObject({ ok: true, value: { op: "linear" } });
  });

  it("rejects unsorted, malformed and oversized input with a message", () => {
    expect(spec.parse("1, 5, 3; 3")).toEqual({ ok: false, error: "Sort the numbers from small to large: 3 comes after 5" });
    expect(spec.parse("1, 2, 3")).toMatchObject({ ok: false });
    expect(spec.parse("1, 2; x")).toMatchObject({ ok: false, error: expect.stringMatching(/^Target:/) });
    expect(spec.parse("fast: 1, 2; 2")).toMatchObject({ ok: false });
    const many = Array.from({ length: 33 }, (_, k) => k).join(", ");
    expect(spec.parse(`${many}; 3`)).toMatchObject({ ok: false, error: expect.stringMatching(/^Too many numbers/) });
  });
});

describe("search text alternatives", () => {
  it("describe() and toTable() reflect the state", () => {
    const t = searchBinaryModel.generate(searchBinaryModel.defaultInput);
    const mid = t.frames.find((f) => f.line === "search.binary.compare")!.state;
    expect(searchBinaryModel.describe(mid)).toContain("Range [0, 32) holds 32 cells.");
    expect(searchBinaryModel.describe(t.frames.at(-1)!.state)).toContain("Result: index 23.");
    const later = t.frames.find((f) => f.state.lo === 17 && f.state.at === null)!.state;
    expect(searchTable(later).rows[3]).toEqual([3, 9, "ruled out"]);
  });

  it("defs bind both models to the same client player", () => {
    expect(searchLinear.model).toBe(searchLinearModel);
    expect(searchBinary.model).toBe(searchBinaryModel);
    expect(searchLinear.Client).toBe(searchBinary.Client);
  });
});

describe("AC-G-2-15: SearchRenderer static markup", () => {
  it("every frame of every preset at 288/390/640/1040 px and as a thumbnail", () => {
    const inputs = [
      searchLinearModel.defaultInput,
      searchBinaryModel.defaultInput,
      ...SEARCH_PRESETS.map((p) => p.value),
      { op: "binary" as const, values: [-99, 999], target: 999 },
      { op: "linear" as const, values: [5], target: 1 },
    ];
    expect(checkRenderer(searchLinearModel, SearchRenderer, inputs)).toEqual([]);
  }, 30_000);
});
