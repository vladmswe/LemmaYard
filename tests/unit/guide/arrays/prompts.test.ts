// Prompts of array.shift, prefix.sums and twopointers.merge do not reveal their
// answer on the frame shown while they are open.
import { describe, expect, it } from "vitest";

import type { VizModel } from "@/lib/guide/contracts";
import { ARRAY_PRESETS, arrayShiftModel } from "@/lib/guide/traces/array";
import { PREFIX_PRESETS, prefixSumsModel } from "@/lib/guide/traces/prefix";
import { MERGE_PRESETS, mergeModel } from "@/lib/guide/traces/twopointers";

import { promptCount, promptLeaks } from "../complexity-basics/prompt-check";

const CASES: [VizModel<unknown, unknown>, readonly unknown[]][] = [
  [arrayShiftModel as VizModel<unknown, unknown>, ARRAY_PRESETS.map((p) => p.value)],
  [prefixSumsModel as VizModel<unknown, unknown>, PREFIX_PRESETS.map((p) => p.value)],
  [mergeModel as VizModel<unknown, unknown>, MERGE_PRESETS.map((p) => p.value)],
];

describe("arrays prompts give nothing away", () => {
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

  it("array.shift tells the move count only once the first element moves", () => {
    const t = arrayShiftModel.generate(arrayShiftModel.defaultInput);
    const k = t.frames.findIndex((f) => f.prompt?.id === "insert-moves");
    expect(t.frames[k - 1]!.narration).toBe("Insert 7 at index 1. First open a gap there, starting from the end.");
    expect(t.frames[k]!.narration).toMatch(/^The 5 elements at indices 1 to 5 each move one slot right/);
  });
});
