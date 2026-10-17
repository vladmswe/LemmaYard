import { describe, expect, it } from "vitest";

import type { Signature } from "@/lib/problems/schema";
import { formatSampleInput, formatValue, splitAtConstraints } from "@/lib/problems/samples";

describe("formatValue", () => {
  it.each([
    [[2, 7, 11], "[2, 7, 11]"],
    [[[1, 2], [3]], "[[1, 2], [3]]"],
    [[], "[]"],
    ["a\"b", '"a\\"b"'],
    [true, "true"],
    [1.5, "1.5"],
    [null, "null"],
  ])("%j -> %s", (value, expected) => {
    expect(formatValue(value)).toBe(expected);
  });
});

describe("formatSampleInput", () => {
  it("follows the signature parameter order", () => {
    const signature: Signature = {
      name: "twoSum",
      params: [
        { name: "nums", type: "int[]" },
        { name: "target", type: "int" },
      ],
      returns: "int[]",
    };
    expect(formatSampleInput(signature, { target: 9, nums: [2, 7] })).toBe("nums = [2, 7], target = 9");
  });
});

describe("splitAtConstraints", () => {
  it("splits before the Constraints heading", () => {
    const md = "Statement.\n\n## Constraints\n\n- `1 <= n`\n\n## Notes\n\nx";
    expect(splitAtConstraints(md)).toEqual({
      before: "Statement.\n\n",
      after: "## Constraints\n\n- `1 <= n`\n\n## Notes\n\nx",
    });
  });

  it("keeps everything before when there is no Constraints heading", () => {
    expect(splitAtConstraints("Only text. Constraints are below.")).toEqual({
      before: "Only text. Constraints are below.",
      after: "",
    });
  });
});
