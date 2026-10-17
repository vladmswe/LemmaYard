// deque.ring: S1, S2 (reference + ring invariant on every frame), S2a (head
// wraps backwards from 0, full ring grows from either end, pops on empty from
// either end), S3 (default trace), input, renderer.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { DequePlayer } from "@/components/guide/viz/deque/DequePlayer";
import { dequeRing } from "@/components/guide/viz/deque/defs";
import { RingRenderer } from "@/components/guide/viz/queue/RingRenderer";
import { type Frame } from "@/lib/guide/contracts";
import { numRuns } from "@/lib/guide/testing/fc";
import { expectTraceValid } from "@/lib/guide/testing/trace-invariants";
import { DEQUE_PRESETS, dequeRingModel, randomDequeInput, type DequeInput, type DequeOp } from "@/lib/guide/traces/deque";
import { runDequeRef } from "@/lib/guide/traces/deque/reference";
import { ringValues, type RingResult, type RingState } from "@/lib/guide/traces/queue";

import { checkRenderer } from "../complexity-basics/render-check";

import { dequeBoundaryArb, dequeInputArb } from "./arbitraries";

const model = dequeRingModel;
const front = (vals: readonly number[]): DequeOp[] => vals.map((value) => ({ kind: "pushFront", value }));
const back = (vals: readonly number[]): DequeOp[] => vals.map((value) => ({ kind: "pushBack", value }));

function checkFrames(input: DequeInput, frames: readonly Frame<RingState>[]) {
  const ref = runDequeRef(input);
  const after = (k: number) => (k === 0 ? [] : ref[Math.min(k, ref.length) - 1]!.list);
  let seen = 0;
  for (const f of frames) {
    const s = f.state;
    const cap = s.buffer.capacity;
    expect(s.head).toBeGreaterThanOrEqual(0);
    expect(s.head).toBeLessThan(cap);
    expect(s.size).toBeLessThanOrEqual(cap);
    const v = JSON.stringify(ringValues(s));
    expect([JSON.stringify(after(s.completed)), JSON.stringify(after(s.completed + 1))], f.narration).toContain(v);
    if (s.completed > seen) {
      seen = s.completed;
      expect(v).toBe(JSON.stringify(after(seen)));
      expect(cap).toBe(ref[seen - 1]!.capacity);
    }
  }
  expect(seen).toBe(input.ops.length);
}

function agrees(input: DequeInput) {
  const t = model.generate(input);
  const ref = runDequeRef(input);
  const r = t.result as RingResult;
  expect(r.values).toEqual(ref.at(-1)!.list);
  expect(r.capacity).toBe(ref.at(-1)!.capacity);
  expect(r.outputs).toEqual(
    ref.filter((_, k) => input.ops[k]!.kind === "popFront" || input.ops[k]!.kind === "popBack").map((x) => (x.ok ? x.value : null)),
  );
  expect(t.frames.at(-1)!.counters.moves).toBe(ref.reduce((a, x) => a + x.copies, 0));
  checkFrames(input, t.frames);
}

describe("deque.ring (S1: generator contract)", () => {
  it("default input, every preset and the random preset", () => {
    for (const input of [model.defaultInput, ...DEQUE_PRESETS.map((p) => p.value), randomDequeInput(11)]) {
      expectTraceValid(model.generate(input), model, { input });
    }
  });

  it("200 random scripts and 200 threshold scripts", () => {
    fc.assert(fc.property(dequeInputArb, (input) => expectTraceValid(model.generate(input), model, { input })), { numRuns: numRuns(200) });
    fc.assert(fc.property(dequeBoundaryArb, (input) => expectTraceValid(model.generate(input), model, { input })), { numRuns: numRuns(200) });
  });
});

describe("deque.ring (S2: reference agreement and ring invariant)", () => {
  it("random scripts", () => {
    fc.assert(fc.property(dequeInputArb, agrees), { numRuns: numRuns(200) });
  });

  it("threshold scripts reach the backward wrap, both grows and both empty pops", () => {
    const seen = new Set<string>();
    fc.assert(
      fc.property(dequeBoundaryArb, (input) => {
        agrees(input);
        for (const f of model.generate(input).frames) {
          if (f.phase === "Step head back (wraps)") seen.add("front wrap");
          if (f.line === "deque.pushFront.full" || f.line === "deque.pushBack.full") seen.add(f.line);
          if (f.line === "deque.popFront.empty" || f.line === "deque.popBack.empty") seen.add(f.line);
        }
      }),
      { numRuns: numRuns(200) },
    );
    expect([...seen].sort()).toEqual([
      "deque.popBack.empty",
      "deque.popFront.empty",
      "deque.pushBack.full",
      "deque.pushFront.full",
      "front wrap",
    ]);
  });
});

describe("deque.ring thresholds (golden)", () => {
  it("pushFront at head 0 writes slot 7; at head 1 it writes slot 0 (no wrap)", () => {
    const t = model.generate({ ops: front([1, 2]) });
    const writes = t.frames.filter((f) => f.line === "deque.pushFront.write");
    expect(writes.map((f) => f.state.head)).toEqual([7, 6]);
    expect(writes[0]!.narration).toBe("pushFront 1: head = (head - 1 + 8) % 8 = (0 - 1 + 8) % 8 = 7. Write 1 at slot 7; size 1.");
    const t2 = model.generate({ ops: [...back([1, 2]), { kind: "popFront" }, ...front([9])] });
    expect(t2.frames.find((f) => f.line === "deque.pushFront.write")!.state.head).toBe(0);
  });

  it("8 pushes fill the ring; the 9th from either end grows it to 16 with head = 0", () => {
    const cap = (ops: DequeOp[]) => (model.generate({ ops }).result as RingResult).capacity;
    expect(cap(front([1, 2, 3, 4, 5, 6, 7, 8]))).toBe(8);
    expect(cap(front([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBe(16);
    expect(cap(back([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBe(16);
    const t = model.generate({ ops: front([1, 2, 3, 4, 5, 6, 7, 8, 9]) });
    const done = t.frames.find((f) => f.line === "deque.grow.done")!.state;
    expect(done.head).toBe(0);
    expect(done.buffer.slots.slice(0, 8).map((s) => s.value)).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    expect((t.result as RingResult).values).toEqual([9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect((t.result as RingResult).head).toBe(15);
  });

  it("popBack reads (head + size - 1) % capacity, also across the end", () => {
    const t = model.generate({ ops: [...front([1, 2]), { kind: "popBack" }, { kind: "popBack" }, { kind: "popBack" }] });
    const reads = t.frames.filter((f) => f.line === "deque.popBack.read").map((f) => f.narration);
    expect(reads).toEqual([
      "popBack returns 1 from slot (head + size - 1) % 8 = (6 + 2 - 1) % 8 = 7; size 1.",
      "popBack returns 2 from slot (head + size - 1) % 8 = (6 + 1 - 1) % 8 = 6; size 0.",
    ]);
    expect(t.frames.filter((f) => f.line === "deque.popBack.empty")).toHaveLength(1);
  });
});

describe("deque.ring (S3: default trace)", () => {
  it("asks which slot pushFront writes at head 0 (7) and whether the ring is full at head = tail = 3 (yes)", () => {
    const t = model.generate(model.defaultInput);
    const prompts = t.frames.filter((f) => f.prompt);
    expect(prompts.map((f) => [f.prompt!.id, f.prompt!.answerId])).toEqual([
      ["ring-front-wrap", "slot7"],
      ["ring-full", "yes"],
    ]);
    expect(prompts[0]!.prompt!.choices.map((c) => c.label)).toEqual(["Slot -1", "Slot 1", "Slot 7"]);
    expect(prompts[1]!.state).toMatchObject({ head: 3, size: 8 });
    expect(t.result).toEqual({ values: [1, 2, 3, 4, 5, 10, 20], capacity: 16, head: 0, outputs: [30, 0] });
    expect(t.frames.at(-1)!.counters).toEqual({ writes: 9, reads: 2, moves: 8 });
  });
});

describe("deque.ring input and defs", () => {
  const spec = model.input!;
  it("parse(format(v)) equals v; op names are case-insensitive; errors use the camelCase names", () => {
    for (const v of [model.defaultInput, ...DEQUE_PRESETS.map((p) => p.value), randomDequeInput(2)]) {
      expect(spec.parse(spec.format(v))).toEqual({ ok: true, value: v });
    }
    expect(spec.parse("PUSHFRONT 1, popback")).toEqual({ ok: true, value: { ops: [...front([1]), { kind: "popBack" }] } });
    expect(spec.parse("enqueue 1")).toMatchObject({ ok: false, error: expect.stringMatching(/pushFront, pushBack, popFront, popBack/) });
    expect(spec.parse("pushFront")).toMatchObject({ ok: false, error: expect.stringMatching(/'pushFront' takes 1 argument/) });
    expect(dequeRing.model).toBe(model);
    expect(typeof DequePlayer).toBe("function");
  });
});

describe("AC-G-4-15: RingRenderer static markup on deque traces", () => {
  it("every frame of every preset at 288/390/640/1040 px and as a thumbnail", () => {
    const inputs = [model.defaultInput, ...DEQUE_PRESETS.map((p) => p.value), { ops: front(Array(16).fill(-99)) }];
    expect(checkRenderer(model, RingRenderer, inputs)).toEqual([]);
  }, 60_000);
});
