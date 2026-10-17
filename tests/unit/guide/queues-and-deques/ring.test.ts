// queue.ring: S1, S2 (reference + ring invariant on every frame), S2a
// (full / grow / wrap / empty, golden on both sides), AC-G-4-12 (grow unrolls
// a wrapped ring; the wrap narration shows the modulo arithmetic), AC-G-4-13
// (same script on queue.naive and queue.ring), S3, input, renderer.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { RingRenderer, ringGeometry } from "@/components/guide/viz/queue/RingRenderer";
import { queueRing } from "@/components/guide/viz/queue/defs";
import { MAX_FRAMES, type Frame } from "@/lib/guide/contracts";
import { numRuns } from "@/lib/guide/testing/fc";
import { expectTraceValid } from "@/lib/guide/testing/trace-invariants";
import {
  QUEUE_PRESETS,
  queueNaiveModel,
  queueRingModel,
  randomQueueInput,
  ringTable,
  ringValues,
  type QueueInput,
  type QueueOp,
  type RingResult,
  type RingState,
} from "@/lib/guide/traces/queue";
import { runQueueRef } from "@/lib/guide/traces/queue/reference";

import { checkRenderer } from "../complexity-basics/render-check";

import { queueBoundaryArb, queueInputArb } from "./arbitraries";

const model = queueRingModel;
const enq = (vals: readonly number[]): QueueOp[] => vals.map((value) => ({ kind: "enqueue", value }));
const deq = (n: number): QueueOp[] => Array.from({ length: n }, () => ({ kind: "dequeue" }));
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k);

/** Ring invariant on every frame: 0 <= head < capacity, size <= capacity, logical order = reference. */
function checkFrames(input: QueueInput, frames: readonly Frame<RingState>[]) {
  const ref = runQueueRef(input);
  const after = (k: number) => (k === 0 ? [] : ref[Math.min(k, ref.length) - 1]!.list);
  let seen = 0;
  for (const f of frames) {
    const s = f.state;
    const cap = s.buffer.capacity;
    expect(s.head).toBeGreaterThanOrEqual(0);
    expect(s.head).toBeLessThan(cap);
    expect(s.size).toBeLessThanOrEqual(cap);
    expect(s.buffer.slots).toHaveLength(cap);
    const v = JSON.stringify(ringValues(s));
    expect([JSON.stringify(after(s.completed)), JSON.stringify(after(s.completed + 1))], f.narration).toContain(v);
    // Slots outside the window are empty, except the one a pop just cleared.
    s.buffer.slots.forEach((slot, k) => {
      const inWindow = (k - s.head + cap) % cap < s.size;
      if (!inWindow && k !== s.cleared) expect(slot.value, `slot ${k}: ${f.narration}`).toBeNull();
    });
    if (s.next) s.next.slots.forEach((slot, i) => slot.value !== null && expect(slot.value).toBe(s.buffer.slots[(s.head + i) % cap]!.value));
    if (s.completed > seen) {
      seen = s.completed;
      expect(v).toBe(JSON.stringify(after(seen)));
      expect(cap).toBe(ref[seen - 1]!.capacity);
    }
  }
  expect(seen).toBe(input.ops.length);
}

function agrees(input: QueueInput) {
  const t = model.generate(input);
  const ref = runQueueRef(input);
  const r = t.result as RingResult;
  expect(r.values).toEqual(ref.at(-1)!.list);
  expect(r.capacity).toBe(ref.at(-1)!.capacity);
  expect(r.outputs).toEqual(ref.filter((_, k) => input.ops[k]!.kind !== "enqueue").map((x) => (x.ok ? x.value : null)));
  expect(t.frames.at(-1)!.counters.moves).toBe(ref.reduce((a, x) => a + x.ringCopies, 0));
  checkFrames(input, t.frames);
}

describe("queue.ring (S1: generator contract)", () => {
  it("default input, every preset and the random preset", () => {
    for (const input of [model.defaultInput, ...QUEUE_PRESETS.map((p) => p.value), randomQueueInput(7)]) {
      expectTraceValid(model.generate(input), model, { input });
    }
  });

  it("200 random scripts and 200 threshold scripts", () => {
    const valid = (input: QueueInput) => {
      const t = model.generate(input);
      expectTraceValid(t, model, { input });
      expect(t.frames.length).toBeLessThanOrEqual(MAX_FRAMES);
    };
    fc.assert(fc.property(queueInputArb, valid), { numRuns: numRuns(200) });
    fc.assert(fc.property(queueBoundaryArb, valid), { numRuns: numRuns(200) });
  });
});

describe("queue.ring (S2: reference agreement and ring invariant)", () => {
  it("random scripts", () => {
    fc.assert(fc.property(queueInputArb, agrees), { numRuns: numRuns(200) });
  });

  it("threshold scripts reach full, grow, wrap and empty", () => {
    const seen = new Set<string>();
    fc.assert(
      fc.property(queueBoundaryArb, (input) => {
        agrees(input);
        for (const f of model.generate(input).frames) {
          if (f.line === "queue.grow.done") seen.add("grow");
          if (f.line === "queue.dequeue.empty" || f.line === "queue.peek.empty") seen.add("empty");
          if (f.phase === "Write at tail (wraps)") seen.add("wrap");
          if (f.line === "queue.dequeue.read" && f.state.head === 0 && f.state.size > 0) seen.add("head wraps");
        }
      }),
      { numRuns: numRuns(200) },
    );
    expect([...seen].sort()).toEqual(["empty", "grow", "head wraps", "wrap"]);
  });
});

describe("AC-G-4-12: growing a full, wrapped ring", () => {
  // head = 5, size = 8, capacity 8: 5 in, 5 out, 8 in; the 9th enqueue grows the ring.
  const input: QueueInput = { ops: [...enq(range(1, 5)), ...deq(5), ...enq(range(11, 18)), ...enq([99])] };

  it("copies old[(head + i) % 8] to new[i] for i < 8, then head = 0, capacity 16", () => {
    const t = model.generate(input);
    const full = t.frames.find((f) => f.line === "queue.enqueue.full")!.state;
    expect([full.head, full.size, full.buffer.capacity]).toEqual([5, 8, 8]);
    const oldValues = full.buffer.slots.map((s) => s.value);
    const done = t.frames.find((f) => f.line === "queue.grow.done")!.state;
    expect(done.head).toBe(0);
    expect(done.buffer.capacity).toBe(16);
    expect(done.buffer.slots.slice(0, 8).map((s) => s.value)).toEqual(range(0, 7).map((i) => oldValues[(5 + i) % 8]));
    expect(done.buffer.slots.slice(0, 8).map((s) => s.value)).toEqual(range(11, 18));
    expect(done.buffer.slots.slice(8).every((s) => s.value === null)).toBe(true);
    const copies = t.frames.filter((f) => f.line === "queue.grow.copy");
    expect(copies).toHaveLength(8);
    expect(copies[3]!.narration).toBe("new[3] = old[(head + 3) % 8] = old[(5 + 3) % 8] = old[0]: copy 14.");
    expect((t.result as RingResult).values).toEqual([...range(11, 18), 99]);
    expect(t.frames.at(-1)!.counters.moves).toBe(8);
  });

  it("8 enqueues fill the ring without growing; the 9th grows it (both sides)", () => {
    const cap = (n: number) => (model.generate({ ops: enq(range(1, n)) }).result as RingResult).capacity;
    expect(cap(8)).toBe(8);
    expect(cap(9)).toBe(16);
    expect(model.generate({ ops: enq(range(1, 8)) }).frames.some((f) => f.line === "queue.enqueue.full")).toBe(false);
  });

  it("the wrap step shows the modulo arithmetic with the actual numbers", () => {
    const t = model.generate(model.defaultInput);
    const wraps = t.frames.filter((f) => f.phase === "Write at tail (wraps)").map((f) => f.narration);
    expect(wraps).toEqual([
      "Enqueue 90: tail = (head + size) % 8 = (6 + 2) % 8 = 0. Write 90 at slot 0; size 3.",
      "Enqueue 100: tail = (head + size) % 8 = (6 + 3) % 8 = 1. Write 100 at slot 1; size 4.",
    ]);
    // One step before the wrap: slot 7, no wrap.
    expect(t.frames.find((f) => f.state.op === "enqueue 80" && f.line === "queue.enqueue.write")!.phase).toBe("Write at tail");
  });

  it("head wraps too: a dequeue at slot 7 moves head to (7 + 1) % 8 = 0", () => {
    const t = model.generate({ ops: [...enq(range(1, 8)), ...deq(8)] });
    const f = t.frames.find((x) => x.state.op === "dequeue" && x.narration.includes("from slot 7"))!;
    expect(f.narration).toBe("Dequeue returns 8 from slot 7. head = (7 + 1) % 8 = 0; size 0.");
    expect(f.state.head).toBe(0);
  });

  it("dequeue and peek on an empty ring fail with an error frame; size 1 still works", () => {
    const t = model.generate({ ops: [...deq(1), { kind: "peek" }, ...enq([5]), ...deq(2)] });
    expect((t.result as RingResult).outputs).toEqual([null, null, 5, null]);
    const errs = t.frames.filter((f) => f.line === "queue.dequeue.empty" || f.line === "queue.peek.empty");
    expect(errs).toHaveLength(3);
    for (const f of errs) expect(f.roles).toEqual({ [f.state.buffer.id]: "error" });
  });
});

describe("AC-G-4-13: the same script on queue.naive and queue.ring", () => {
  for (const id of ["same-script", "grow-wrapped", "fill-up", "empty"]) {
    it(`preset ${id}: naive moves = sum of (size - 1) over dequeues; ring moves = grow copies only`, () => {
      const input = QUEUE_PRESETS.find((p) => p.id === id)!.value;
      const ref = runQueueRef(input);
      let size = 0;
      let expectedNaive = 0;
      for (const op of input.ops) {
        if (op.kind === "enqueue") size++;
        else if (op.kind === "dequeue" && size > 0) {
          expectedNaive += size - 1;
          size--;
        }
      }
      const naive = queueNaiveModel.generate(input).frames.at(-1)!.counters;
      const ring = model.generate(input).frames.at(-1)!.counters;
      expect(naive.moves).toBe(expectedNaive);
      expect(ring.moves).toBe(ref.reduce((a, x) => a + x.ringCopies, 0));
      expect([naive.writes, naive.reads]).toEqual([ring.writes, ring.reads]);
      expect(queueNaiveModel.generate(input).result).toEqual({
        values: (model.generate(input).result as RingResult).values,
        outputs: (model.generate(input).result as RingResult).outputs,
      });
    });
  }

  it("on the default script: 21 moves for the plain list, 0 for the ring", () => {
    const input = QUEUE_PRESETS.find((p) => p.id === "same-script")!.value;
    expect(input).toEqual(model.defaultInput);
    expect(queueNaiveModel.generate(input).frames.at(-1)!.counters.moves).toBe(6 + 5 + 4 + 3 + 2 + 1);
    expect(model.generate(input).frames.at(-1)!.counters.moves).toBe(0);
  });
});

describe("queue.ring (S3: default trace)", () => {
  it("asks which slot the enqueue at head 6, size 3 uses (slot 1), with the tail tag hidden the frame before", () => {
    const t = model.generate(model.defaultInput);
    const k = t.frames.findIndex((f) => f.prompt);
    const p = t.frames[k]!.prompt!;
    expect(p.question).toBe("head = 6, size = 3, capacity 8: which slot does the next enqueue use?");
    expect(p.choices.map((c) => c.label)).toEqual(["Slot 0", "Slot 1", "Slot 9"]);
    expect(p.answerId).toBe("slot1");
    expect(t.frames[k - 1]!.pointers).toEqual({ head: "r0s6" });
    expect(t.frames[k]!.pointers).toEqual({ head: "r0s6", tail: "r0s2" });
    expect(t.result).toEqual({ values: [70, 80, 90, 100], capacity: 8, head: 6, outputs: [10, 20, 30, 40, 50, 60] });
  });

  it("the grow-wrapped preset asks whether the ring is full when head = tail = 3", () => {
    const t = model.generate(QUEUE_PRESETS.find((p) => p.id === "grow-wrapped")!.value);
    expect(t.frames.filter((x) => x.prompt).map((x) => x.prompt!.id)).toEqual(["ring-wrap-slot", "ring-full"]);
    const f = t.frames.find((x) => x.prompt?.id === "ring-full")!;
    expect(f.prompt!.question).toBe("head and tail point at the same slot. Can head and tail alone tell you whether the ring is full or empty?");
    expect(f.prompt!.answerId).toBe("size");
    expect(f.line).toBe("queue.enqueue.full");
  });
});

describe("queue.ring input, text alternatives, defs", () => {
  const spec = model.input!;
  it("parse(format(v)) equals v; bad scripts are rejected", () => {
    for (const v of [model.defaultInput, ...QUEUE_PRESETS.map((p) => p.value), randomQueueInput(9)]) {
      expect(spec.parse(spec.format(v))).toEqual({ ok: true, value: v });
    }
    fc.assert(
      fc.property(queueInputArb, (v) => {
        expect(spec.parse(spec.format(v))).toEqual({ ok: true, value: v });
        expect(spec.format(v).length).toBeLessThanOrEqual(spec.maxLength);
      }),
      { numRuns: numRuns(200) },
    );
    expect(spec.parse("enqueue")).toMatchObject({ ok: false });
    expect(spec.parse("push 1")).toMatchObject({ ok: false, error: expect.stringMatching(/enqueue, dequeue, peek/) });
  });

  it("describe() and toTable() name head, size, tail and the slots", () => {
    const end = model.generate(model.defaultInput).frames.at(-1)!.state;
    expect(model.describe(end)).toBe(
      "Ring of 8 slots, head = 6, size = 4, tail = 2. Slots 0: 90, 1: 100, 2: empty, 3: empty, 4: empty, 5: empty, 6: 70, 7: 80. Head to tail: 70, 80, 90, 100. Last returned value: 60.",
    );
    expect(ringTable(end).rows[6]).toEqual([6, 70, "head", ""]);
    expect(ringTable(end).rows[2]).toEqual([2, "", "tail", ""]);
    expect(queueRing.model).toBe(model);
  });
});

describe("AC-G-4-15: RingRenderer static markup", () => {
  it("the ring fits at 288 px with 8 and 16 slots", () => {
    expect(2 * ringGeometry(8, 264, true).half).toBeLessThanOrEqual(264);
    expect(2 * ringGeometry(16, 264, true).half).toBeLessThanOrEqual(264);
  });

  it("every frame of every preset at 288/390/640/1040 px and as a thumbnail", () => {
    const inputs = [model.defaultInput, ...QUEUE_PRESETS.map((p) => p.value), { ops: enq(Array(16).fill(-99)) }];
    expect(checkRenderer(model, RingRenderer, inputs)).toEqual([]);
  }, 60_000);
});
