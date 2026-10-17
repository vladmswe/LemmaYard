// queue.naive: S1, S2 (reference + per-frame order, moves = size - 1 per
// dequeue), S2a (empty, one element, the shift boundary), S3, renderer.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { NaiveRenderer } from "@/components/guide/viz/queue/NaiveRenderer";
import { queueNaive } from "@/components/guide/viz/queue/defs";
import { type Frame } from "@/lib/guide/contracts";
import { numRuns } from "@/lib/guide/testing/fc";
import { expectTraceValid } from "@/lib/guide/testing/trace-invariants";
import {
  QUEUE_PRESETS,
  naiveTable,
  queueNaiveModel,
  randomQueueInput,
  type NaiveResult,
  type NaiveState,
  type QueueInput,
  type QueueOp,
} from "@/lib/guide/traces/queue";
import { runQueueRef } from "@/lib/guide/traces/queue/reference";

import { checkRenderer } from "../complexity-basics/render-check";

import { queueBoundaryArb, queueInputArb } from "./arbitraries";

const model = queueNaiveModel;
const enq = (vals: readonly number[]): QueueOp[] => vals.map((value) => ({ kind: "enqueue", value }));
const deq = (n: number): QueueOp[] => Array.from({ length: n }, () => ({ kind: "dequeue" }));

function checkFrames(input: QueueInput, frames: readonly Frame<NaiveState>[]) {
  const ref = runQueueRef(input);
  const after = (k: number) => (k === 0 ? [] : ref[Math.min(k, ref.length) - 1]!.list);
  let seen = 0;
  for (const f of frames) {
    const s = f.state;
    const v = JSON.stringify(s.items.map((it) => it.value));
    // While the gap is open, the dequeued value is out but the rest have not moved yet.
    expect([JSON.stringify(after(s.completed)), JSON.stringify(after(s.completed + 1))], f.narration).toContain(v);
    if (s.gap) expect(s.removed).not.toBeNull();
    if (s.completed > seen) {
      seen = s.completed;
      expect(v).toBe(JSON.stringify(after(seen)));
      expect(s.gap).toBe(false);
    }
  }
  expect(seen).toBe(input.ops.length);
}

function agrees(input: QueueInput) {
  const t = model.generate(input);
  const ref = runQueueRef(input);
  const r = t.result as NaiveResult;
  expect(r.values).toEqual(ref.at(-1)!.list);
  expect(r.outputs).toEqual(ref.filter((_, k) => input.ops[k]!.kind !== "enqueue").map((x) => (x.ok ? x.value : null)));
  expect(t.frames.at(-1)!.counters.moves).toBe(ref.reduce((a, x) => a + x.naiveMoves, 0));
  // Each dequeue's shift frame adds exactly the values left behind it.
  for (const [k, f] of t.frames.entries()) {
    if (f.line !== "naive.dequeue.shift") continue;
    expect(f.counters.moves! - t.frames[k - 1]!.counters.moves!).toBe(f.state.items.length);
  }
  checkFrames(input, t.frames);
}

describe("queue.naive (S1: generator contract)", () => {
  it("default input, every preset and the random preset", () => {
    for (const input of [model.defaultInput, ...QUEUE_PRESETS.map((p) => p.value), randomQueueInput(4)]) {
      expectTraceValid(model.generate(input), model, { input });
    }
  });

  it("200 random scripts and 200 threshold scripts", () => {
    fc.assert(fc.property(queueInputArb, (input) => expectTraceValid(model.generate(input), model, { input })), { numRuns: numRuns(200) });
    fc.assert(fc.property(queueBoundaryArb, (input) => expectTraceValid(model.generate(input), model, { input })), { numRuns: numRuns(200) });
  });
});

describe("queue.naive (S2: reference agreement)", () => {
  it("random and threshold scripts: values, outputs, moves", () => {
    fc.assert(fc.property(queueInputArb, agrees), { numRuns: numRuns(200) });
    fc.assert(fc.property(queueBoundaryArb, agrees), { numRuns: numRuns(200) });
  });

  it("golden: a dequeue moves size - 1 values (2 values: 1 move, 1 value: 0 moves, empty: error)", () => {
    const moves = (ops: QueueOp[]) => model.generate({ ops }).frames.at(-1)!.counters.moves;
    expect(moves([...enq([1, 2]), ...deq(1)])).toBe(1);
    expect(moves([...enq([1]), ...deq(1)])).toBe(0);
    const t = model.generate({ ops: deq(1) });
    expect(t.frames[1]!.line).toBe("naive.dequeue.empty");
    expect((t.result as NaiveResult).outputs).toEqual([null]);
  });
});

describe("queue.naive (S3: default trace)", () => {
  it("asks how many values move after the first dequeue of 4 (3)", () => {
    const t = model.generate(model.defaultInput);
    const f = t.frames.find((x) => x.prompt)!;
    expect(f.prompt).toMatchObject({ id: "naive-moves", answerId: "n3" });
    expect(f.prompt!.question).toBe("10 has left index 0. How many values move to close the gap?");
    expect(f.state.items.map((it) => it.value)).toEqual([20, 30, 40]);
    expect(t.result).toEqual({ values: [40, 50], outputs: [10, 20, 30, 30] });
    expect(t.frames.at(-1)!.counters).toEqual({ writes: 5, reads: 4, moves: 7 });
  });

  it("values keep their ids while they shift", () => {
    const t = model.generate(model.defaultInput);
    const k = t.frames.findIndex((x) => x.prompt);
    expect(t.frames[k - 1]!.state.items.map((it) => it.id)).toEqual(t.frames[k]!.state.items.map((it) => it.id));
  });
});

describe("queue.naive text alternatives and defs", () => {
  it("describe() and toTable() show the gap while it is open", () => {
    const t = model.generate(model.defaultInput);
    const gap = t.frames.find((f) => f.state.gap)!.state;
    expect(model.describe(gap)).toMatch(/Index 0 is empty for a moment after 10 left/);
    expect(naiveTable(gap).rows[0]).toEqual([0, 10, "just dequeued"]);
    expect(queueNaive.model).toBe(model);
  });
});

describe("AC-G-4-15: NaiveRenderer static markup", () => {
  it("every frame of every preset at 288/390/640/1040 px and as a thumbnail", () => {
    const inputs = [model.defaultInput, ...QUEUE_PRESETS.map((p) => p.value), { ops: enq(Array(16).fill(-99)) }];
    expect(checkRenderer(model, NaiveRenderer, inputs)).toEqual([]);
  }, 30_000);
});
