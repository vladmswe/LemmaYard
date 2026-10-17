// stack.ops: S1 (contract), S2 (reference + per-frame invariant), S2a
// (thresholds: growth at 4 and 8, pop/peek on empty), S3 (default trace),
// input parsing, text alternatives and the static-markup renderer check.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { StackRenderer } from "@/components/guide/viz/stack/StackRenderer";
import { stackOps } from "@/components/guide/viz/stack/defs";
import { MAX_FRAMES, type Frame } from "@/lib/guide/contracts";
import { numRuns } from "@/lib/guide/testing/fc";
import { expectTraceValid } from "@/lib/guide/testing/trace-invariants";
import {
  STACK_MAX_OPS,
  STACK_PRESETS,
  randomStackInput,
  stackOpsModel,
  stackTable,
  type StackInput,
  type StackItem,
  type StackOp,
  type StackResult,
  type StackState,
} from "@/lib/guide/traces/stack";
import { runStackRef } from "@/lib/guide/traces/stack/reference";

import { checkRenderer } from "../complexity-basics/render-check";

const model = stackOpsModel;
const pushes = (vals: readonly number[]): StackOp[] => vals.map((value) => ({ kind: "push", value }));
const pops = (n: number): StackOp[] => Array.from({ length: n }, () => ({ kind: "pop" }));
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k);

const opArb: fc.Arbitrary<StackOp> = fc.oneof(
  { weight: 5, arbitrary: fc.record({ kind: fc.constant("push" as const), value: fc.integer({ min: -99, max: 999 }) }) },
  { weight: 3, arbitrary: fc.constant({ kind: "pop" as const }) },
  { weight: 2, arbitrary: fc.constant({ kind: "peek" as const }) },
);
const inputArb: fc.Arbitrary<StackInput> = fc.record({ ops: fc.array(opArb, { minLength: 1, maxLength: STACK_MAX_OPS }) });

/**
 * Threshold scripts (S2a): a run of pushes that stops on either side of a
 * growth point (4 -> 8 at the 5th push, 8 -> 16 at the 9th), then pops that
 * can run past empty, then a short mixed tail with peeks.
 */
const boundaryArb: fc.Arbitrary<StackInput> = fc
  .record({
    up: fc.constantFrom(0, 1, 3, 4, 5, 8, 9, 12),
    down: fc.integer({ min: 0, max: 6 }),
    tail: fc.array(opArb, { maxLength: 4 }),
  })
  .map(({ up, down, tail }) => ({ ops: [...pushes(range(1, up)), ...pops(down), ...tail].slice(0, STACK_MAX_OPS) }))
  .filter((v) => v.ops.length > 0);

const live = (s: StackState) => s.slots.slice(0, s.size).map((it) => (it as StackItem).value);

/** Per-frame invariant: top = size - 1, slots above top empty, contents = reference before or after the op in progress. */
function checkFrames(input: StackInput, frames: readonly Frame<StackState>[]) {
  const ref = runStackRef(input);
  const after = (k: number) => (k === 0 ? [] : ref[Math.min(k, ref.length) - 1]!.list);
  let seen = 0;
  for (const f of frames) {
    const s = f.state;
    expect(s.top).toBe(s.size - 1);
    expect(s.slots).toHaveLength(s.capacity);
    s.slots.forEach((it, k) => expect(it !== null, `slot ${k} of "${f.narration}"`).toBe(k < s.size));
    const v = JSON.stringify(live(s));
    expect([JSON.stringify(after(s.completed)), JSON.stringify(after(s.completed + 1))], f.narration).toContain(v);
    if (s.completed > seen) {
      seen = s.completed;
      expect(v).toBe(JSON.stringify(after(seen)));
      expect(s.capacity).toBe(ref[seen - 1]!.capacity);
    }
    expect(f.pointers?.top).toBe(s.size ? (s.slots[s.size - 1] as StackItem).id : null);
  }
  expect(seen).toBe(input.ops.length);
}

function agreesWithReference(input: StackInput) {
  const t = model.generate(input);
  const ref = runStackRef(input);
  const r = t.result as StackResult;
  expect(r.values).toEqual(ref.at(-1)!.list);
  expect(r.capacity).toBe(ref.at(-1)!.capacity);
  expect(r.outputs).toEqual(ref.filter((_, k) => input.ops[k]!.kind !== "push").map((x) => (x.ok ? x.value : null)));
  const end = t.frames.at(-1)!;
  expect(end.counters.copies).toBe(ref.reduce((a, x) => a + x.copies, 0));
  expect(end.counters.writes).toBe(input.ops.filter((o) => o.kind === "push").length);
  expect(end.state.capacity).toBe(ref.at(-1)!.capacity);
  checkFrames(input, t.frames);
}

describe("stack.ops (S1: generator contract)", () => {
  it("default input, every preset and the random preset", () => {
    for (const input of [model.defaultInput, ...STACK_PRESETS.map((p) => p.value), randomStackInput(1), randomStackInput(2)]) {
      expectTraceValid(model.generate(input), model, { input });
    }
  });

  it("200 random inputs (property) and 200 threshold scripts", () => {
    fc.assert(
      fc.property(inputArb, (input) => {
        const t = model.generate(input);
        expectTraceValid(t, model, { input });
        expect(t.frames.length).toBeLessThanOrEqual(MAX_FRAMES);
      }),
      { numRuns: numRuns(200) },
    );
    fc.assert(fc.property(boundaryArb, (input) => expectTraceValid(model.generate(input), model, { input })), { numRuns: numRuns(200) });
  });
});

describe("stack.ops (S2: reference agreement and per-frame invariant)", () => {
  it("values, capacity, outputs and counters equal the reference on random scripts", () => {
    fc.assert(fc.property(inputArb, agreesWithReference), { numRuns: numRuns(200) });
  });

  it("the same holds for threshold scripts (growth, empty, refill)", () => {
    fc.assert(fc.property(boundaryArb, agreesWithReference), { numRuns: numRuns(200) });
  });
});

describe("stack.ops thresholds (golden, both sides)", () => {
  const capAfter = (n: number) => (model.generate({ ops: pushes(range(1, n)) }).result as StackResult).capacity;
  const copiesAfter = (n: number) => model.generate({ ops: pushes(range(1, n)) }).frames.at(-1)!.counters.copies;

  it("4 pushes fit in 4 slots; the 5th doubles to 8 and copies 4", () => {
    expect([capAfter(4), copiesAfter(4)]).toEqual([4, 0]);
    expect([capAfter(5), copiesAfter(5)]).toEqual([8, 4]);
  });

  it("8 pushes fit in 8 slots; the 9th doubles to 16 (4 + 8 copies in all)", () => {
    expect([capAfter(8), copiesAfter(8)]).toEqual([8, 4]);
    expect([capAfter(9), copiesAfter(9)]).toEqual([16, 12]);
  });

  it("the grow frame comes before the write and shows the new buffer", () => {
    const t = model.generate({ ops: pushes(range(1, 5)) });
    const k = t.frames.findIndex((f) => f.line === "stack.push.grow");
    expect(t.frames[k]!.state.capacity).toBe(8);
    expect(t.frames[k]!.state.size).toBe(4);
    expect(t.frames[k]!.roles).toEqual({ [t.frames[k]!.state.bufferId]: "changed" });
    expect(t.frames[k + 1]!.line).toBe("stack.push.write");
  });

  it("pop on one element works, pop and peek on none fail with an error frame", () => {
    const t = model.generate({ ops: [...pushes([7]), ...pops(1), { kind: "peek" }, ...pops(1)] });
    expect((t.result as StackResult).outputs).toEqual([7, null, null]);
    const errors = t.frames.filter((f) => f.line === "stack.peek.empty" || f.line === "stack.pop.empty");
    expect(errors.map((f) => f.line)).toEqual(["stack.peek.empty", "stack.pop.empty"]);
    for (const f of errors) expect(Object.values(f.roles)).toEqual(["error"]);
    expect(t.frames.find((f) => f.line === "stack.pop.read")!.state.top).toBe(-1);
  });
});

describe("stack.ops (S3: default trace)", () => {
  it("asks which value pop returns (2) and what is on top after push 1, push 2, pop, push 3 (3)", () => {
    const t = model.generate(model.defaultInput);
    const prompts = t.frames.filter((f) => f.prompt).map((f) => [f.prompt!.id, f.prompt!.question, f.prompt!.answerId]);
    expect(prompts).toEqual([
      ["stack-pop-which", "pop() runs now. Which value comes out?", "v2"],
      ["stack-peek-top", "After push 1, push 2, pop, push 3, what is on top?", "v3"],
    ]);
    const peek = t.frames.find((f) => f.prompt?.id === "stack-peek-top")!;
    expect(peek.line).toBe("stack.peek.read");
    expect(peek.state.out).toBe(3);
    expect(t.result).toEqual({ values: [], capacity: 4, outputs: [2, 3, 3, 1, null] });
    expect(t.frames.at(-1)!.counters).toEqual({ writes: 3, reads: 4, copies: 0 });
  });
});

describe("stack.ops input", () => {
  const spec = model.input!;
  it("parse(format(v)) equals v", () => {
    for (const v of [model.defaultInput, ...STACK_PRESETS.map((p) => p.value), randomStackInput(5)]) {
      expect(spec.parse(spec.format(v))).toEqual({ ok: true, value: v });
    }
    expect(spec.format(model.defaultInput)).toBe("push 1, push 2, pop, push 3, peek, pop, pop, pop");
    fc.assert(
      fc.property(inputArb, (v) => {
        expect(spec.parse(spec.format(v))).toEqual({ ok: true, value: v });
        expect(spec.format(v).length).toBeLessThanOrEqual(spec.maxLength);
      }),
      { numRuns: numRuns(200) },
    );
  });

  it("rejects malformed scripts with a message", () => {
    expect(spec.parse("push")).toMatchObject({ ok: false, error: expect.stringMatching(/takes 1 argument/) });
    expect(spec.parse("pop 3")).toMatchObject({ ok: false, error: expect.stringMatching(/takes 0 arguments/) });
    expect(spec.parse("enqueue 1")).toMatchObject({ ok: false, error: expect.stringMatching(/not one of push, pop, peek/) });
    expect(spec.parse(Array(17).fill("pop").join(", "))).toMatchObject({ ok: false, error: expect.stringMatching(/Too many ops/) });
    expect(spec.parse("push 1000")).toMatchObject({ ok: false, error: expect.stringMatching(/out of range/) });
  });
});

describe("stack.ops text alternatives and defs", () => {
  it("describe() and toTable() name the top and the popped value", () => {
    const t = model.generate(model.defaultInput);
    const popped = t.frames.find((f) => f.line === "stack.pop.read")!.state;
    expect(model.describe(popped)).toBe("Stack in an array of 4 slots, size 1. Bottom to top: 1; top = 0. Last returned value: 2.");
    expect(stackTable(popped).rows[1]).toEqual([1, 2, "just popped"]);
    expect(stackOps.model).toBe(model);
  });
});

describe("AC-G-4-15: StackRenderer static markup", () => {
  it("every frame of every preset at 288/390/640/1040 px and as a thumbnail", () => {
    const inputs = [model.defaultInput, ...STACK_PRESETS.map((p) => p.value), { ops: pushes(Array(16).fill(-99)) }];
    expect(checkRenderer(model, StackRenderer, inputs)).toEqual([]);
  }, 30_000);
});
