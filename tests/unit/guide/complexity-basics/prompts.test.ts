// Prompts of search.linear / search.binary do not reveal their answer on the frame shown while they are open.
import { describe, expect, it } from "vitest";

import { SEARCH_PRESETS, searchBinaryModel, searchLinearModel } from "@/lib/guide/traces/search";

import { promptCount, promptLeaks, wholeMatch } from "./prompt-check";

describe("prompt-check helper", () => {
  it("matches whole numbers and phrases only", () => {
    expect(wholeMatch("5").test("the 5 elements")).toBe(true);
    expect(wholeMatch("5").test("index 15, or 1.5")).toBe(false);
    expect(wholeMatch("3").test("average 1.3")).toBe(false);
    expect(wholeMatch("2 from B").test("take 2 from B now")).toBe(true);
    expect(wholeMatch("2 from B").test("12 from Bx")).toBe(false);
  });

  it("flags the leak of the old array.shift setup frame", () => {
    const leaky = {
      vizId: "x",
      frames: [
        { state: 0, roles: {}, line: null, phase: "Start", narration: "the 5 elements must move", counters: {} },
        {
          state: 0,
          roles: {},
          line: null,
          phase: "Shift",
          narration: "move",
          counters: {},
          prompt: { id: "p", question: "q", choices: [{ id: "a", label: "5" }, { id: "b", label: "6" }], answerId: "a", explain: "e" },
        },
      ],
    };
    expect(promptLeaks(leaky)).toHaveLength(1);
  });
});

describe("search prompts give nothing away", () => {
  for (const model of [searchLinearModel, searchBinaryModel]) {
    it(`${model.id}: default input and every preset`, () => {
      let prompts = 0;
      for (const input of [model.defaultInput, ...SEARCH_PRESETS.map((p) => p.value)]) {
        const t = model.generate(input);
        prompts += promptCount(t);
        expect(promptLeaks(t)).toEqual([]);
      }
      expect(prompts).toBeGreaterThan(0);
    });
  }
});
