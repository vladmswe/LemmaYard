// stack.monotonic: S1, S2 (reference + stack values never increase after a
// push), AC-G-4-11 (500 arrays vs the O(n^2) reference; pushes = n, pops <= n),
// S3 (default trace), input, renderer.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { MonotonicRenderer } from "@/components/guide/viz/stack/MonotonicRenderer";
import { stackMonotonic } from "@/components/guide/viz/stack/defs";
import { numRuns } from "@/lib/guide/testing/fc";
import { expectTraceValid } from "@/lib/guide/testing/trace-invariants";
import {
  MONO_MAX_VALUES,
  MONO_PRESETS,
  monoTable,
  randomMonoInput,
  stackMonotonicModel,
  type MonoInput,
} from "@/lib/guide/traces/stack";
import { refNextGreater } from "@/lib/guide/traces/stack/reference";

import { checkRenderer } from "../complexity-basics/render-check";

const model = stackMonotonicModel;
const arb = (min: number, max: number): fc.Arbitrary<MonoInput> =>
  fc.array(fc.integer({ min, max }), { minLength: 1, maxLength: MONO_MAX_VALUES }).map((values) => ({ values }));
/** Full range, and a narrow range so equal values (the strict "<" boundary) are common (S2a). */
const wideArb = arb(-99, 999);
const tiesArb = arb(1, 4);
const sortedArb = fc.oneof(
  wideArb.map((v) => ({ values: [...v.values].sort((a, b) => a - b) })),
  wideArb.map((v) => ({ values: [...v.values].sort((a, b) => b - a) })),
);

function agrees(input: MonoInput) {
  const t = model.generate(input);
  const n = input.values.length;
  expect(t.result).toEqual(refNextGreater(input.values));
  const end = t.frames.at(-1)!.state;
  expect(end.answers).toEqual(refNextGreater(input.values));
  expect(end.pushes).toBe(n);
  expect(end.pops).toBeLessThanOrEqual(n);
  expect(end.pops + end.stack.length).toBe(n); // every index is popped once or still waits
  expect(t.frames.at(-1)!.counters.comparisons!).toBeLessThanOrEqual(2 * n);
  let prevPushes = 0;
  for (const f of t.frames) {
    const s = f.state;
    // An index that got its answer is never on the stack (the last frame sets the leftovers to -1).
    if (f !== t.frames.at(-1)) for (const j of s.stack) expect(s.answers[j]).toBeNull();
    else for (const j of s.stack) expect(s.answers[j]).toBe(-1);
    s.answers.forEach((x, j) => {
      if (x !== null && f !== t.frames.at(-1)) expect(x).toBe(refNextGreater(input.values)[j]);
    });
    if (s.pushes > prevPushes) {
      prevPushes = s.pushes;
      const vals = s.stack.map((j) => input.values[j]!);
      for (let k = 1; k < vals.length; k++) expect(vals[k]!, f.narration).toBeLessThanOrEqual(vals[k - 1]!);
    }
  }
}

describe("stack.monotonic (S1: generator contract)", () => {
  it("default input, every preset and the random preset", () => {
    for (const input of [model.defaultInput, ...MONO_PRESETS.map((p) => p.value), randomMonoInput(3)]) {
      expectTraceValid(model.generate(input), model, { input });
    }
  });

  it("200 random arrays, 200 with many ties, 200 sorted either way", () => {
    for (const a of [wideArb, tiesArb, sortedArb]) {
      fc.assert(fc.property(a, (input) => expectTraceValid(model.generate(input), model, { input })), { numRuns: numRuns(200) });
    }
  });
});

describe("AC-G-4-11: stack.monotonic equals the O(n^2) next greater element", () => {
  it("500 random arrays: answers, pushes = n, pops <= n, values on the stack never increase", () => {
    fc.assert(fc.property(wideArb, agrees), { numRuns: numRuns(500) });
  });

  it("ties and sorted inputs (S2a)", () => {
    fc.assert(fc.property(tiesArb, agrees), { numRuns: numRuns(200) });
    fc.assert(fc.property(sortedArb, agrees), { numRuns: numRuns(200) });
  });

  it("equal values do not pop each other; increasing pops at every step, decreasing never", () => {
    expect(model.generate({ values: [5, 5, 5, 6] }).result).toEqual([6, 6, 6, -1]);
    expect(model.generate({ values: [5, 6] }).frames.filter((f) => f.line === "monotonic.pop")).toHaveLength(1);
    expect(model.generate({ values: [5, 5] }).frames.filter((f) => f.line === "monotonic.pop")).toHaveLength(0);
    const inc = model.generate({ values: [1, 2, 3, 4, 5, 6] }).frames.at(-1)!.state;
    expect([inc.pushes, inc.pops]).toEqual([6, 5]);
    const dec = model.generate({ values: [6, 5, 4, 3, 2, 1] }).frames.at(-1)!.state;
    expect([dec.pushes, dec.pops, dec.stack.length]).toEqual([6, 0, 6]);
  });
});

describe("stack.monotonic (S3: default trace)", () => {
  it("when 7 arrives at index 4, indices 1 and 3 get their answer and 9 stays", () => {
    const t = model.generate(model.defaultInput);
    const f = t.frames.find((x) => x.prompt)!;
    expect(f.prompt!.question).toBe("Which indices get their answer when 7 arrives?");
    expect(f.prompt!.choices.map((c) => c.label)).toEqual(["Indices 1 and 3", "Only index 3", "Indices 0, 1 and 3"]);
    expect(f.prompt!.answerId).toBe("popped");
    expect(f.state.i).toBe(4);
    expect(f.state.answers[1]).toBe(7);
    expect(f.state.answers[3]).toBe(7);
    expect(f.state.stack).toEqual([0]);
    expect(t.result).toEqual([-1, 7, 3, 7, 8, 8, -1, -1]);
    expect(t.frames.at(-1)!.state).toMatchObject({ pushes: 8, pops: 5, stack: [0, 6, 7] });
  });
});

describe("stack.monotonic input, text alternatives, defs", () => {
  const spec = model.input!;
  it("parse(format(v)) equals v; bad input is rejected", () => {
    for (const v of [model.defaultInput, ...MONO_PRESETS.map((p) => p.value)]) expect(spec.parse(spec.format(v))).toEqual({ ok: true, value: v });
    expect(spec.parse("")).toMatchObject({ ok: false });
    expect(spec.parse("1, 2, x")).toMatchObject({ ok: false, error: expect.stringMatching(/not a whole number/) });
    expect(spec.parse(Array(13).fill(1).join(","))).toMatchObject({ ok: false, error: expect.stringMatching(/Too many/) });
  });

  it("describe() and toTable() list the answers and the stack", () => {
    const end = model.generate({ values: [2, 1, 3] }).frames.at(-1)!.state;
    expect(model.describe(end)).toBe("Values 2, 1, 3. Next greater so far: 0: 3, 1: 3, 2: -1. Stack of indices, bottom to top: 2 (3). 3 pushes, 2 pops.");
    expect(monoTable(end).rows).toEqual([
      [0, 2, 3, ""],
      [1, 1, 3, ""],
      [2, 3, -1, "yes"],
    ]);
    expect(stackMonotonic.model).toBe(model);
  });
});

describe("AC-G-4-15: MonotonicRenderer static markup", () => {
  it("every frame of every preset at 288/390/640/1040 px and as a thumbnail", () => {
    const inputs = [model.defaultInput, ...MONO_PRESETS.map((p) => p.value), { values: Array(12).fill(-99) }, { values: [999, 998, 997, 996, 995, 994, 993, 992, 991, 990, 989, 988] }];
    expect(checkRenderer(model, MonotonicRenderer, inputs)).toEqual([]);
  }, 30_000);
});
