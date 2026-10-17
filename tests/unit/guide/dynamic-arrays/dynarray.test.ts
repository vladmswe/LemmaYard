import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { DynArrayRenderer } from "@/components/guide/viz/dynarray/DynArrayRenderer";
import { dynArrayOps } from "@/components/guide/viz/dynarray/defs";
import { MAX_FRAMES, type Frame } from "@/lib/guide/contracts";
import { numRuns } from "@/lib/guide/testing/fc";
import { expectTraceValid } from "@/lib/guide/testing/trace-invariants";
import {
  DYN_MAX_OPS,
  DYN_PRESETS,
  dynArrayModel,
  dynTable,
  randomDynInput,
  type DynInput,
  type DynOp,
  type DynResult,
  type DynState,
} from "@/lib/guide/traces/dynarray";
import { runDynRef } from "@/lib/guide/traces/dynarray/reference";

import { checkRenderer } from "../complexity-basics/render-check";

const model = dynArrayModel;

const opArb: fc.Arbitrary<DynOp> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("append" as const), value: fc.integer({ min: -99, max: 999 }) }) },
  { weight: 2, arbitrary: fc.constant({ kind: "pop" as const }) },
);
const inputArb: fc.Arbitrary<DynInput> = fc.record({
  initialCapacity: fc.constantFrom(1 as const, 2 as const, 4 as const),
  growth: fc.constantFrom(2 as const, 1.5 as const),
  shrink: fc.constantFrom("quarter" as const, "half" as const),
  ops: fc.array(opArb, { minLength: 1, maxLength: DYN_MAX_OPS }),
});

const values = (s: DynState) => s.buffer.slots.slice(0, s.size).map((c) => c?.value);
const appends = (vals: readonly number[]): DynOp[] => vals.map((value) => ({ kind: "append", value }));
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k);

/** Per-frame invariants of section 3.3 against the reference run. */
function checkFrames(input: DynInput, frames: readonly Frame<DynState>[]) {
  const ref = runDynRef(input);
  const after = (k: number) => (k === 0 ? [] : ref[k - 1]!.list);
  let seen = 0;
  for (const f of frames) {
    const s = f.state;
    expect(s.size).toBeLessThanOrEqual(s.buffer.capacity);
    expect(s.buffer.capacity).toBeGreaterThanOrEqual(input.initialCapacity);
    expect(s.buffer.slots).toHaveLength(s.buffer.capacity);
    if (s.next) {
      expect(s.next.capacity).toBeGreaterThanOrEqual(input.initialCapacity);
      expect(s.next.capacity).toBeGreaterThanOrEqual(s.size);
      s.next.slots.forEach((c, k) => {
        if (c) expect(c.value).toBe(s.buffer.slots[k]?.value);
      });
    }
    // Elements 0..size-1 equal the reference list (before or after the op in progress).
    const v = values(s);
    const ok = JSON.stringify(v) === JSON.stringify(after(s.completed)) || JSON.stringify(v) === JSON.stringify(after(s.completed + 1));
    expect(ok, `frame "${f.narration}" holds ${JSON.stringify(v)}`).toBe(true);
    if (s.completed > seen) {
      seen = s.completed;
      expect(v).toEqual(after(seen));
      expect(s.buffer.capacity).toBe(ref[seen - 1]!.capacity);
    }
  }
  expect(seen).toBe(input.ops.length);
}

describe("dynarray.ops (S1: generator contract)", () => {
  it("default input and every preset", () => {
    for (const input of [model.defaultInput, ...DYN_PRESETS.map((p) => p.value)]) {
      expectTraceValid(model.generate(input), model, { input });
    }
  });

  it("200 random inputs (property), up to 20 ops and every policy", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const t = model.generate(input);
        expectTraceValid(t, model, { input });
        expect(t.frames.length).toBeLessThanOrEqual(MAX_FRAMES);
      }),
      { numRuns: numRuns(200) },
    );
  });

  it("the worst thrashing inputs stay under the frame cap", () => {
    for (const growth of [2, 1.5] as const) {
      for (let fill = 1; fill < DYN_MAX_OPS; fill++) {
        const ops: DynOp[] = [...appends(range(1, fill))];
        while (ops.length < DYN_MAX_OPS) ops.push(ops.length % 2 === fill % 2 ? { kind: "append", value: 7 } : { kind: "pop" });
        const input: DynInput = { initialCapacity: 1, growth, shrink: "half", ops };
        const t = model.generate(input);
        expect(t.frames.length).toBeLessThanOrEqual(MAX_FRAMES);
        expectTraceValid(t, model, { input });
      }
    }
  });
});

describe("dynarray.ops (S2: reference agreement and per-frame invariants)", () => {
  it("lists, capacities, popped values and counters equal the reference run", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const t = model.generate(input);
        const ref = runDynRef(input);
        const last = ref.at(-1)!;
        expect((t.result as DynResult).values).toEqual(last.list);
        expect((t.result as DynResult).capacity).toBe(last.capacity);
        expect((t.result as DynResult).popped).toEqual(ref.filter((_, k) => input.ops[k]!.kind === "pop").map((r) => (r.ok ? r.value : null)));
        const end = t.frames.at(-1)!.counters;
        expect(end.copies).toBe(ref.reduce((x, r) => x + r.copies, 0));
        expect(end.resizes).toBe(ref.filter((r) => r.resized).length);
        checkFrames(input, t.frames);
      }),
      { numRuns: numRuns(200) },
    );
  });
});

describe("AC-G-2-13: amortized cost, thrashing, pop on empty", () => {
  it("17 appends from capacity 1 with x2: capacity 32, 31 copies, 5 resizes, running average < 3 after every append", () => {
    const input: DynInput = { initialCapacity: 1, growth: 2, shrink: "quarter", ops: appends(range(1, 17)) };
    const t = model.generate(input);
    const end = t.frames.at(-1)!;
    expect(end.state.buffer.capacity).toBe(32);
    expect(end.counters).toEqual({ writes: 17, copies: 31, resizes: 5 });
    const resizeCopies = t.frames
      .filter((f) => f.line === "dynarray.resize.swap")
      .map((f, k, all) => f.counters.copies! - (k === 0 ? 0 : all[k - 1]!.counters.copies!));
    expect(resizeCopies).toEqual([1, 2, 4, 8, 16]);
    const writeFrames = t.frames.filter((f) => f.line === "dynarray.append.write");
    expect(writeFrames).toHaveLength(17);
    for (const f of writeFrames) {
      const c = f.state.costs;
      expect(c.reduce((x, y) => x + y, 0) / c.length).toBeLessThan(3);
    }
    expect(end.state.costs).toEqual([1, 2, 3, 1, 5, 1, 1, 1, 9, 1, 1, 1, 1, 1, 1, 1, 17]);
  });

  it("thrash at the boundary: the 12 append/pop ops resize >= 6 times at 1/2 and at most once at 1/4", () => {
    const resizesInLast12 = (shrink: "half" | "quarter") => {
      const preset = DYN_PRESETS.find((p) => p.id === (shrink === "half" ? "thrash" : "no-thrash"))!.value;
      expect(preset.shrink).toBe(shrink);
      expect(preset.ops).toHaveLength(20);
      const t = model.generate(preset);
      // Counters on the frame that finishes op 8 (the array is full at size 8).
      const before = t.frames.find((f) => f.state.completed === 8)!.counters.resizes!;
      return t.frames.at(-1)!.counters.resizes! - before;
    };
    expect(resizesInLast12("half")).toBeGreaterThanOrEqual(6);
    expect(resizesInLast12("half")).toBe(12);
    expect(resizesInLast12("quarter")).toBeLessThanOrEqual(1);
  });

  it("pop on an empty array gives an error frame on the buffer, not an exception", () => {
    const input: DynInput = { initialCapacity: 2, growth: 2, shrink: "quarter", ops: [{ kind: "pop" }, ...appends([5])] };
    const t = model.generate(input);
    const err = t.frames[1]!;
    expect(err.line).toBe("dynarray.pop.empty");
    expect(err.roles).toEqual({ [err.state.buffer.id]: "error" });
    expect((t.result as DynResult).popped).toEqual([null]);
    expect((t.result as DynResult).values).toEqual([5]);
  });

  it("pop returns the removed value; shrinking never goes below the starting capacity", () => {
    const input: DynInput = { initialCapacity: 4, growth: 2, shrink: "quarter", ops: [...appends([1, 2, 3, 4, 5]), ...Array(5).fill({ kind: "pop" })] };
    const t = model.generate(input);
    expect((t.result as DynResult).popped).toEqual([5, 4, 3, 2, 1]);
    expect((t.result as DynResult).capacity).toBe(4);
    expect(Math.min(...t.frames.map((f) => f.state.buffer.capacity))).toBe(4);
  });
});

describe("dynarray.ops (S3: golden default trace)", () => {
  it("five appends grow 1 -> 2 -> 4 -> 8, three pops shrink 8 -> 4 at size 2", () => {
    const t = model.generate(model.defaultInput);
    const caps = t.frames.filter((f) => f.line === "dynarray.resize.swap").map((f) => f.state.buffer.capacity);
    expect(caps).toEqual([2, 4, 8, 4]);
    const prompts = t.frames.filter((f) => f.prompt).map((f) => [f.prompt!.id, f.prompt!.answerId]);
    expect(prompts).toEqual([
      ["dyn-grow-copies", "n4"],
      ["dyn-shrink-capacity", "n4"],
    ]);
    expect(t.frames.at(-1)?.counters).toEqual({ writes: 8, copies: 9, resizes: 4 });
    expect(t.result).toEqual({ values: [3, 8], capacity: 4, popped: [4, 9, 1] });
  });
});

describe("dynarray.ops input", () => {
  const spec = model.input!;
  it("parse(format(v)) equals v; grouped format fits the field", () => {
    for (const v of [model.defaultInput, ...DYN_PRESETS.map((p) => p.value), randomDynInput(3)]) {
      expect(spec.parse(spec.format(v))).toEqual({ ok: true, value: v });
    }
    expect(spec.format(model.defaultInput)).toBe("cap 1 x2 1/4: append 3 8 1 9 4, pop 3");
    fc.assert(
      fc.property(inputArb, (v) => {
        expect(spec.parse(spec.format(v))).toEqual({ ok: true, value: v });
        expect(spec.format(v).length).toBeLessThanOrEqual(spec.maxLength);
      }),
      { numRuns: numRuns(200) },
    );
  });

  it("accepts ops without options and one op per clause", () => {
    expect(spec.parse("append 1, append 2, pop")).toEqual({
      ok: true,
      value: { initialCapacity: 1, growth: 2, shrink: "quarter", ops: [...appends([1, 2]), { kind: "pop" }] },
    });
  });

  it("rejects malformed input with a message", () => {
    expect(spec.parse("cap 3: append 1")).toMatchObject({ ok: false, error: expect.stringMatching(/1, 2 or 4/) });
    expect(spec.parse("x3: append 1")).toMatchObject({ ok: false, error: expect.stringMatching(/Unknown option/) });
    expect(spec.parse("append")).toMatchObject({ ok: false, error: expect.stringMatching(/needs at least one number/) });
    expect(spec.parse("push 1")).toMatchObject({ ok: false, error: expect.stringMatching(/not append or pop/) });
    expect(spec.parse(`append ${range(1, 21).join(" ")}`)).toMatchObject({ ok: false, error: expect.stringMatching(/Too many ops/) });
    expect(spec.parse("append 1000")).toMatchObject({ ok: false, error: expect.stringMatching(/out of range/) });
  });
});

describe("dynarray.ops text alternatives and defs", () => {
  it("describe() and toTable() show both buffers during a resize", () => {
    const t = model.generate(model.defaultInput);
    const copying = t.frames.find((f) => f.line === "dynarray.resize.copy" && f.state.next?.capacity === 8)!.state;
    expect(model.describe(copying)).toMatch(/New buffer of 8 slots being filled: 3, empty/);
    expect(dynTable(copying).rows).toHaveLength(8);
    expect(dynArrayOps.model).toBe(model);
  });
});

describe("AC-G-2-15: DynArrayRenderer static markup", () => {
  it("every frame of every preset at 288/390/640/1040 px and as a thumbnail", () => {
    const inputs = [
      model.defaultInput,
      ...DYN_PRESETS.map((p) => p.value),
      { initialCapacity: 1 as const, growth: 2 as const, shrink: "quarter" as const, ops: appends(Array(20).fill(-99)) },
    ];
    expect(checkRenderer(model, DynArrayRenderer, inputs)).toEqual([]);
  }, 30_000);
});
