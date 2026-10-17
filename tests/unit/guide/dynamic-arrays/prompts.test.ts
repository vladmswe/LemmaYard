// Prompts of dynarray.ops do not reveal their answer on the frame shown while they are open.
import { describe, expect, it } from "vitest";

import { DYN_PRESETS, dynArrayModel } from "@/lib/guide/traces/dynarray";

import { promptCount, promptLeaks } from "../complexity-basics/prompt-check";

describe("dynarray prompts give nothing away", () => {
  it("default input and every preset", () => {
    let prompts = 0;
    for (const input of [dynArrayModel.defaultInput, ...DYN_PRESETS.map((p) => p.value)]) {
      const t = dynArrayModel.generate(input);
      prompts += promptCount(t);
      expect(promptLeaks(t)).toEqual([]);
    }
    expect(prompts).toBeGreaterThan(0);
  });
});
