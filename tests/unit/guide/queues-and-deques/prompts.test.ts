// Prompts of queue.naive, queue.ring and deque.ring do not reveal their answer
// on the frame shown while they are open (S2a): not in its narration or phase,
// and for the "which slot" questions the tail tag is hidden on that frame.
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { VizModel } from "@/lib/guide/contracts";
import { numRuns } from "@/lib/guide/testing/fc";
import { DEQUE_PRESETS, dequeRingModel } from "@/lib/guide/traces/deque";
import { QUEUE_PRESETS, queueNaiveModel, queueRingModel, type RingState } from "@/lib/guide/traces/queue";

import { promptCount, promptLeaks } from "../complexity-basics/prompt-check";

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
