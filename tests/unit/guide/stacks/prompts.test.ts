// Prompts of stack.ops, stack.brackets and stack.monotonic do not reveal their
// answer on the frame shown while they are open (S2a).
import { describe, expect, it } from "vitest";

import type { VizModel } from "@/lib/guide/contracts";
import {
  BRACKETS_PRESETS,
  MONO_PRESETS,
  STACK_PRESETS,
  stackBracketsModel,
  stackMonotonicModel,
  stackOpsModel,
} from "@/lib/guide/traces/stack";

import { promptCount, promptLeaks } from "../complexity-basics/prompt-check";

const CASES: [VizModel<unknown, unknown>, readonly unknown[]][] = [
  [stackOpsModel as VizModel<unknown, unknown>, STACK_PRESETS.map((p) => p.value)],
  [stackBracketsModel as VizModel<unknown, unknown>, BRACKETS_PRESETS.map((p) => p.value)],
  [stackMonotonicModel as VizModel<unknown, unknown>, MONO_PRESETS.map((p) => p.value)],
];

describe("stacks prompts give nothing away", () => {
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

  it("stack.ops: the push before each prompt does not name its value", () => {
    const t = stackOpsModel.generate(stackOpsModel.defaultInput);
    for (const [k, f] of t.frames.entries()) {
      if (!f.prompt) continue;
      expect(t.frames[k - 1]!.narration).toBe("Write the new value in the first free slot, just above the old top, and move top up by one.");
    }
  });

  it("stack.monotonic: the frame before the question does not list the popped indices", () => {
    const t = stackMonotonicModel.generate(stackMonotonicModel.defaultInput);
    const k = t.frames.findIndex((f) => f.prompt);
    expect(t.frames[k - 1]!.narration).toBe("Push index 3. Values on the stack now read 9, 4, 3 from bottom to top: they never increase.");
    expect(Object.values(t.frames[k - 1]!.roles)).not.toContain("done");
  });
});
