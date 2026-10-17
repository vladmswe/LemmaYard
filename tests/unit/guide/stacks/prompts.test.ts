// Prompts of stack.ops, stack.brackets and stack.monotonic do not reveal their
// answer on the frame shown while they are open (S2a).
import { describe, expect, it } from "vitest";

import fc from "fast-check";

import { BracketsRenderer } from "@/components/guide/viz/stack/BracketsRenderer";
import { MonotonicRenderer } from "@/components/guide/viz/stack/MonotonicRenderer";
import { StackRenderer } from "@/components/guide/viz/stack/StackRenderer";
import type { VizModel } from "@/lib/guide/contracts";
import { numRuns } from "@/lib/guide/testing/fc";
import {
  BRACKETS_PRESETS,
  MONO_PRESETS,
  STACK_PRESETS,
  stackBracketsModel,
  stackMonotonicModel,
  stackOpsModel,
  type StackInput,
  type StackItem,
  type StackOp,
  type StackState,
} from "@/lib/guide/traces/stack";

import { promptCount, promptLeaks } from "../complexity-basics/prompt-check";

import { screenLeaks } from "./screen-check";

const stackInputArb: fc.Arbitrary<StackInput> = fc.record({
  ops: fc.array(
    fc.oneof(
      fc.record({ kind: fc.constant("push" as const), value: fc.integer({ min: -99, max: 999 }) }),
      fc.constant<StackOp>({ kind: "pop" }),
      fc.constant<StackOp>({ kind: "peek" }),
    ),
    { minLength: 1, maxLength: 16 },
  ),
});

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

  // The frame on screen must not show the answer as the top of the stack, or in the header.
  const topShown = (s: StackState) => (s.size > 0 ? [String((s.slots[s.size - 1] as StackItem).value)] : []);

  it("stack.ops: the answer is not the top value or in the header of the frame on screen", () => {
    for (const input of [stackOpsModel.defaultInput, ...STACK_PRESETS.map((p) => p.value)]) {
      expect(screenLeaks(stackOpsModel.generate(input), StackRenderer, topShown)).toEqual([]);
    }
    fc.assert(
      fc.property(stackInputArb, (input) => {
        const t = stackOpsModel.generate(input);
        expect(screenLeaks(t, null, topShown)).toEqual([]);
        expect(promptLeaks(t)).toEqual([]);
      }),
      { numRuns: numRuns(200) },
    );
  });

  it("stack.ops: the default asks right after the pop, before push 3 runs", () => {
    const t = stackOpsModel.generate(stackOpsModel.defaultInput);
    const k = t.frames.findIndex((f) => f.prompt);
    expect(t.frames[k]!.prompt!.question).toBe("push 3 runs next. What will be on top?");
    expect(t.frames[k - 1]!.line).toBe("stack.pop.read");
    expect(t.frames[k - 1]!.narration).toBe("Pop returns 2 from index 1, the top. top moves down to 0.");
    expect(topShown(t.frames[k - 1]!.state)).toEqual(["1"]);
  });

  it("stack.monotonic: the frame before the question does not list the popped indices", () => {
    const t = stackMonotonicModel.generate(stackMonotonicModel.defaultInput);
    const k = t.frames.findIndex((f) => f.prompt);
    expect(t.frames[k - 1]!.narration).toBe("Push index 3. Values on the stack now read 9, 4, 3 from bottom to top: they never increase.");
    expect(Object.values(t.frames[k - 1]!.roles)).not.toContain("done");
  });

  it("brackets and monotonic: the headers of the frames on screen do not give the answer", () => {
    for (const input of [stackBracketsModel.defaultInput, ...BRACKETS_PRESETS.map((p) => p.value)]) {
      expect(screenLeaks(stackBracketsModel.generate(input), BracketsRenderer, () => [])).toEqual([]);
    }
    for (const input of [stackMonotonicModel.defaultInput, ...MONO_PRESETS.map((p) => p.value)]) {
      expect(screenLeaks(stackMonotonicModel.generate(input), MonotonicRenderer, () => [])).toEqual([]);
    }
  });
});
