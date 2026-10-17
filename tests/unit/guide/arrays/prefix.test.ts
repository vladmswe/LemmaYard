import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { prefixSums } from "@/components/guide/viz/prefix/defs";
import { PrefixRenderer } from "@/components/guide/viz/prefix/PrefixRenderer";
import { MAX_FRAMES, type Frame } from "@/lib/guide/contracts";
import { numRuns } from "@/lib/guide/testing/fc";
import { expectTraceValid } from "@/lib/guide/testing/trace-invariants";
import {
  PREFIX_MAX,
  PREFIX_MAX_VALUES,
  PREFIX_MIN,
  PREFIX_PRESETS,
  prefixSumsModel,
  prefixTable,
  randomPrefixInput,
  type PrefixInput,
  type PrefixState,
} from "@/lib/guide/traces/prefix";
import { prefixRef, rangeSumRef } from "@/lib/guide/traces/prefix/reference";

import { checkRenderer } from "../complexity-basics/render-check";

const model = prefixSumsModel;

const valuesArb = fc.array(fc.integer({ min: PREFIX_MIN, max: PREFIX_MAX }), { minLength: 1, maxLength: PREFIX_MAX_VALUES });
const inputArb: fc.Arbitrary<PrefixInput> = valuesArb.chain((values) =>
  fc
    .tuple(fc.integer({ min: 0, max: values.length }), fc.integer({ min: 0, max: values.length }))
    .map(([x, y]) => ({ values, l: Math.min(x, y), r: Math.max(x, y) })),
);

/** p[0] = 0 and p[i + 1] = p[i] + a[i] for every built cell; built cells form a prefix of p. */
function checkFrames(frames: readonly Frame<PrefixState>[]) {
  for (const f of frames) {
    const { a, p } = f.state;
    expect(p).toHaveLength(a.length + 1);
    const built = p.findIndex((c) => c === null);
    const count = built === -1 ? p.length : built;
    expect(p.slice(count).every((c) => c === null)).toBe(true);
    if (count > 0) expect(p[0]!.value).toBe(0);
    for (let i = 0; i + 1 < count; i++) expect(p[i + 1]!.value).toBe(p[i]!.value + a[i]!.value);
  }
}

describe("prefix.sums (S1: generator contract)", () => {
  it("default input and every preset", () => {
    for (const input of [model.defaultInput, ...PREFIX_PRESETS.map((p) => p.value)]) {
      expectTraceValid(model.generate(input), model, { input });
    }
  });

  it("200 random inputs (property), up to 12 values", () => {
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

describe("prefix.sums (S2: reference agreement and per-frame invariants)", () => {
  it("final p equals the direct prefix sums, the result the direct range sum; every frame keeps p[i+1] = p[i] + a[i]", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const t = model.generate(input);
        const last = t.frames.at(-1)!.state;
        expect(last.p.map((c) => c?.value)).toEqual(prefixRef(input.values));
        expect(t.result).toBe(rangeSumRef(input.values, input.l, input.r));
        expect(last.result).toBe(t.result);
        checkFrames(t.frames);
      }),
      { numRuns: numRuns(200) },
    );
  });
});

describe("prefix.sums (S3: golden example)", () => {
  it("3, 1, 4, 1, 5, 9, 2, 6 and [2, 5): p = 0 3 4 8 9 14 23 25 31, sum 10 = p[5] - p[2]", () => {
    const t = model.generate(model.defaultInput);
    expect(t.frames.at(-1)!.state.p.map((c) => c?.value)).toEqual([0, 3, 4, 8, 9, 14, 23, 25, 31]);
    expect(t.result).toBe(10);
    const last = t.frames.at(-1)!;
    expect(last.prompt).toMatchObject({ id: "prefix-cells", answerId: "p5-p2" });
    expect(last.prompt!.choices.map((c) => c.label)).toEqual(["p[5] - p[2]", "p[4] - p[2]", "p[5] - p[1]", "p[6] - p[2]"]);
    expect(last.narration).toContain("p[5] - p[2] = 14 - 4 = 10");
    expect(last.counters).toEqual({ reads: 18, writes: 9 });
    expect(t.frames.find((f) => f.prompt?.id === "prefix-next")?.prompt?.answerId).toBe("v8");
  });
});

describe("AC-G-2-11: range sums", () => {
  it("for random arrays, every [l, r) with 0 <= l <= r <= n gives the direct sum", () => {
    fc.assert(
      fc.property(valuesArb, (values) => {
        const n = values.length;
        for (let l = 0; l <= n; l++) {
          for (let r = l; r <= n; r++) {
            expect(model.generate({ values, l, r }).result).toBe(rangeSumRef(values, l, r));
          }
        }
      }),
      { numRuns: numRuns(100) },
    );
  });

  it("the empty range returns 0", () => {
    for (let k = 0; k <= 8; k++) expect(model.generate({ values: [3, 1, 4, 1, 5, 9, 2, 6], l: k, r: k }).result).toBe(0);
  });
});

describe("prefix.sums input", () => {
  const spec = model.input!;
  it("parse(format(v)) equals v", () => {
    for (const v of [model.defaultInput, ...PREFIX_PRESETS.map((p) => p.value), randomPrefixInput(2), randomPrefixInput(8)]) {
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

  it("rejects bad ranges with a message", () => {
    expect(spec.parse("1, 2, 3; 2 1")).toMatchObject({ ok: false, error: expect.stringMatching(/write the smaller end first/) });
    expect(spec.parse("1, 2, 3; 0 4")).toMatchObject({ ok: false, error: expect.stringMatching(/^Range: .*out of range \(0 to 3\)/) });
    expect(spec.parse("1, 2, 3; 1")).toMatchObject({ ok: false, error: "Range: give l and r" });
    expect(spec.parse("1, 2, 3")).toMatchObject({ ok: false });
  });
});

describe("prefix.sums text alternatives and defs", () => {
  it("describe() and toTable() show both rows", () => {
    const s = model.generate(model.defaultInput).frames.at(-1)!.state;
    expect(model.describe(s)).toContain("Prefix sums p (9 cells): 0, 3, 4, 8, 9, 14, 23, 25, 31");
    expect(prefixTable(s).rows[8]).toEqual([8, "", 31]);
    expect(prefixSums.model).toBe(model);
  });
});

describe("AC-G-2-15: PrefixRenderer static markup", () => {
  it("every frame of every preset at 288/390/640/1040 px and as a thumbnail", () => {
    const inputs = [
      model.defaultInput,
      ...PREFIX_PRESETS.map((p) => p.value),
      { values: [999, 999, 999, 999, 999, 999, 999, 999, 999, 999, 999, 999], l: 0, r: 12 },
      { values: [-99, -99, -99, -99, -99, -99, -99, -99, -99, -99, -99, -99], l: 3, r: 9 },
      { values: [7], l: 0, r: 1 },
    ];
    expect(checkRenderer(model, PrefixRenderer, inputs)).toEqual([]);
  }, 30_000);
});
