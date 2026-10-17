// Prompts of queue.naive, queue.ring and deque.ring do not reveal their answer
// on the frame shown while they are open (S2a): not in its narration or phase,
// and for the "which slot" questions the tail tag is hidden on that frame.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { VizModel } from "@/lib/guide/contracts";
import { numRuns } from "@/lib/guide/testing/fc";
import { DEQUE_PRESETS, dequeRingModel } from "@/lib/guide/traces/deque";
import { QUEUE_PRESETS, queueNaiveModel, queueRingModel, type RingState } from "@/lib/guide/traces/queue";

import { NaiveRenderer } from "@/components/guide/viz/queue/NaiveRenderer";
import { RingRenderer } from "@/components/guide/viz/queue/RingRenderer";

import { promptCount, promptLeaks } from "../complexity-basics/prompt-check";
import { screenLeaks } from "../stacks/screen-check";

import { dequeBoundaryArb, dequeInputArb, queueBoundaryArb, queueInputArb } from "./arbitraries";

const CASES: [VizModel<unknown, unknown>, readonly unknown[]][] = [
  [queueNaiveModel as VizModel<unknown, unknown>, QUEUE_PRESETS.map((p) => p.value)],
  [queueRingModel as VizModel<unknown, unknown>, QUEUE_PRESETS.map((p) => p.value)],
  [dequeRingModel as VizModel<unknown, unknown>, DEQUE_PRESETS.map((p) => p.value)],
];

describe("queues-and-deques prompts give nothing away", () => {
  for (const [model, presets] of CASES) {
    it(`${model.id}: default input and every preset`, () => {
      let prompts = 0;
      for (const input of [model.defaultInput, ...presets]) {
        const t = model.generate(input);
        prompts += promptCount(t);
        expect(promptLeaks(t)).toEqual([]);
      }
      expect(prompts).toBeGreaterThan(0);
    });
  }

  // A ring frame on screen shows its size and, when tagged, the tail slot.
  const ringShown = (s: RingState, ptrs: Readonly<Record<string, string | null>> | undefined) => {
    const out = [String(s.size), `${s.size}`];
    if (ptrs?.tail) out.push(`Slot ${(s.head + s.size) % s.buffer.capacity}`);
    if (s.size === s.buffer.capacity) out.push("Yes", "Yes: head == tail means full");
    return out;
  };

  it("the answer is not the size, the tagged tail slot or a header line of the frame on screen", () => {
    for (const input of [queueRingModel.defaultInput, ...QUEUE_PRESETS.map((p) => p.value)]) {
      expect(screenLeaks(queueRingModel.generate(input), RingRenderer, ringShown)).toEqual([]);
      expect(screenLeaks(queueNaiveModel.generate(input), NaiveRenderer, () => [])).toEqual([]);
    }
    expect(screenLeaks(queueNaiveModel.generate(queueNaiveModel.defaultInput), NaiveRenderer, () => [])).toEqual([]);
    for (const input of [dequeRingModel.defaultInput, ...DEQUE_PRESETS.map((p) => p.value)]) {
      expect(screenLeaks(dequeRingModel.generate(input), RingRenderer, ringShown)).toEqual([]);
    }
    for (const arb of [queueInputArb, queueBoundaryArb]) {
      fc.assert(fc.property(arb, (input) => void expect(screenLeaks(queueRingModel.generate(input), null, ringShown)).toEqual([])), {
        numRuns: numRuns(200),
      });
    }
    for (const arb of [dequeInputArb, dequeBoundaryArb]) {
      fc.assert(fc.property(arb, (input) => void expect(screenLeaks(dequeRingModel.generate(input), null, ringShown)).toEqual([])), {
        numRuns: numRuns(200),
      });
    }
  });

  it("ring prompts stay quiet on random and threshold scripts too, and slot questions hide the tail tag", () => {
    const check = (model: VizModel<RingState, unknown>) => (input: unknown) => {
      const t = model.generate(input);
      expect(promptLeaks(t)).toEqual([]);
      t.frames.forEach((f, k) => {
        if (f.prompt && f.prompt.id !== "ring-full") expect(t.frames[k - 1]!.pointers?.tail).toBeUndefined();
        if (f.prompt) expect(f.prompt.choices.some((c) => c.id === f.prompt!.answerId)).toBe(true);
      });
    };
    fc.assert(fc.property(queueInputArb, check(queueRingModel as VizModel<RingState, unknown>)), { numRuns: numRuns(200) });
    fc.assert(fc.property(queueBoundaryArb, check(queueRingModel as VizModel<RingState, unknown>)), { numRuns: numRuns(200) });
    fc.assert(fc.property(dequeInputArb, check(dequeRingModel as VizModel<RingState, unknown>)), { numRuns: numRuns(200) });
    fc.assert(fc.property(dequeBoundaryArb, check(dequeRingModel as VizModel<RingState, unknown>)), { numRuns: numRuns(200) });
  });
});
