import { describe, expect, it } from "vitest";

import {
  findUnsafeNumberLiterals,
  formatType,
  isIntBased,
  parseType,
  RETURN_POSITION,
  validateInput,
  validateValue,
  wideIntPositions,
} from "@/lib/types";

const t = (s: string) => {
  const type = parseType(s);
  if (!type) throw new Error(`bad type ${s}`);
  return type;
};

describe("parseType", () => {
  it.each(["int", "float", "bool", "string", "int[]", "string[][]", "bool[][]"])(
    "parses %s",
    (s) => expect(formatType(t(s))).toBe(s),
  );

  it.each(["", "long", "int[][][]", "int []", "[]", "Int", "int[", "list[int]"])(
    "rejects %j",
    (s) => expect(parseType(s)).toBeNull(),
  );
});

describe("validateValue", () => {
  it("int: integers within ±(2^53−1) only", () => {
    expect(validateValue(5, t("int"))).toEqual([]);
    expect(validateValue(-0, t("int"))).toEqual([]);
    expect(validateValue(Number.MAX_SAFE_INTEGER, t("int"))).toEqual([]);
    expect(validateValue(-Number.MAX_SAFE_INTEGER, t("int"))).toEqual([]);
    expect(validateValue(2 ** 53, t("int"))[0].message).toMatch(/outside the range/);
    expect(validateValue(1.5, t("int"))[0].message).toMatch(/expected int/);
    expect(validateValue("1", t("int"))).toHaveLength(1);
    expect(validateValue(true, t("int"))).toHaveLength(1);
  });

  it("float: any finite number", () => {
    expect(validateValue(1.5, t("float"))).toEqual([]);
    expect(validateValue(3, t("float"))).toEqual([]);
    expect(validateValue(Number.NaN, t("float"))).toHaveLength(1);
    expect(validateValue(Infinity, t("float"))).toHaveLength(1);
    expect(validateValue(null, t("float"))).toHaveLength(1);
  });

  it("bool and string", () => {
    expect(validateValue(false, t("bool"))).toEqual([]);
    expect(validateValue(0, t("bool"))).toHaveLength(1);
    expect(validateValue("", t("string"))).toEqual([]);
    expect(validateValue(1, t("string"))).toHaveLength(1);
  });

  it("arrays report the path of each bad element", () => {
    expect(validateValue([], t("int[]"))).toEqual([]);
    expect(validateValue([[1], [], [2, 3]], t("int[][]"))).toEqual([]);
    expect(validateValue([1, "x", 3], t("int[]"))).toEqual([
      { path: "$[1]", message: "expected int, got string" },
    ]);
    expect(validateValue([[1], 2], t("int[][]"))).toEqual([
      { path: "$[1]", message: "expected int[], got integer" },
    ]);
    expect(validateValue({}, t("string[]"))[0].message).toBe("expected string[], got object");
  });
});

describe("validateInput", () => {
  const sig = {
    name: "twoSum",
    params: [
      { name: "nums", type: "int[]" },
      { name: "target", type: "int" },
    ],
    returns: "int[]",
  };

  it("accepts a matching object", () => {
    expect(validateInput({ nums: [1, 2], target: 3 }, sig)).toEqual([]);
  });

  it("requires keys to equal the parameter names", () => {
    expect(validateInput({ nums: [1] }, sig)).toEqual([
      { path: "$", message: 'missing parameter "target"' },
    ]);
    expect(validateInput({ nums: [1], target: 1, extra: 1 }, sig)).toEqual([
      { path: "$", message: 'unknown parameter "extra"' },
    ]);
  });

  it("validates each value", () => {
    expect(validateInput({ nums: [1, 2.5], target: 3 }, sig)).toEqual([
      { path: "$.nums[1]", message: "expected int, got non-integer number" },
    ]);
  });

  it("rejects non-objects", () => {
    expect(validateInput([1, 2], sig)[0].message).toBe("expected an object, got array");
    expect(validateInput(null, sig)).toHaveLength(1);
  });
});

describe("findUnsafeNumberLiterals", () => {
  const literals = (text: string) => findUnsafeNumberLiterals(text).map((u) => u.literal);

  it("finds integer literals beyond ±(2^53−1) with their position", () => {
    const text = '{\n  "a": [9007199254740991, -9007199254740992],\n  "b": 123456789012345678901\n}';
    expect(findUnsafeNumberLiterals(text)).toEqual([
      {
        literal: "-9007199254740992",
        line: 2,
        column: 27,
        message: "integer -9007199254740992 is outside the range ±(2^53−1)",
      },
      {
        literal: "123456789012345678901",
        line: 3,
        column: 8,
        message: "integer 123456789012345678901 is outside the range ±(2^53−1)",
      },
    ]);
  });

  it("flags fraction/exponent literals with |value| >= 2^52", () => {
    const text = '[4503599627370496.5, -4503599627370497.0, 1e300, 99999999999999999999.5, 1e400, 4.6e15, 4.5e15]';
    expect(literals(text)).toEqual([
      "4503599627370496.5",
      "-4503599627370497.0",
      "1e300",
      "99999999999999999999.5",
      "1e400",
      "4.6e15",
    ]);
    expect(findUnsafeNumberLiterals("[1e300]")[0].message).toMatch(
      /^number 1e300 has a fraction or exponent and \|value\| ≥ 2\^52/,
    );
  });

  it("flags non-integer literals that parse to an integer", () => {
    expect(findUnsafeNumberLiterals("[0.99999999999999999999, 1e-400]")).toEqual([
      expect.objectContaining({
        literal: "0.99999999999999999999",
        message: "number 0.99999999999999999999 is not an integer but parses as 1 (precision loss)",
      }),
      expect.objectContaining({ literal: "1e-400" }),
    ]);
  });

  it("accepts safe values: strings, small fractions, exact integers like 1.0", () => {
    const text = '{"s": "99999999999999999999", "k\\"99999999999999999999": 1.5, "a": 1.0, "b": 2.5e1, "c": -0.0, "d": 4503599627370495.5, "e": 1e-6, "f": 9007199254740991}';
    expect(findUnsafeNumberLiterals(text)).toEqual([]);
  });
});

describe("wideIntPositions (Java int vs long)", () => {
  const signature = {
    name: "f",
    params: [
      { name: "x", type: "int" },
      { name: "nums", type: "int[]" },
      { name: "grid", type: "int[][]" },
      { name: "ratio", type: "float" },
      { name: "s", type: "string" },
    ],
    returns: "int[]",
  };
  const input = (over: Record<string, unknown> = {}) => ({ x: 0, nums: [], grid: [], ratio: 0, s: "", ...over });

  it("is empty when every int fits in 32 bits (the bounds included)", () => {
    const tests = [
      { input: input({ x: 2 ** 31 - 1, nums: [-(2 ** 31)], grid: [[1, 2]] }), expected: [2 ** 31 - 1] },
    ];
    expect(wideIntPositions(signature, tests)).toEqual([]);
  });

  it("names each int position with a value outside 32 bits, in signature order, return last", () => {
    expect(wideIntPositions(signature, [{ input: input({ grid: [[0], [2 ** 31]] }), expected: [-(2 ** 31) - 1] }])).toEqual([
      "grid",
      RETURN_POSITION,
    ]);
    expect(
      wideIntPositions(signature, [
        { input: input(), expected: [] },
        { input: input({ x: -(2 ** 40), nums: [9007199254740991] }), expected: [] },
      ]),
    ).toEqual(["x", "nums"]);
  });

  it("ignores non-int positions (floats are doubles anyway) and tests without expected", () => {
    expect(wideIntPositions(signature, [{ input: input({ ratio: 1e12, s: "99999999999" }) }])).toEqual([]);
    expect(isIntBased("int[][]")).toBe(true);
    expect(isIntBased("float[]")).toBe(false);
    expect(isIntBased("nope")).toBe(false);
  });
});
