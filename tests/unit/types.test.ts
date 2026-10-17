import { describe, expect, it } from "vitest";

import {
  findUnsafeIntegerLiterals,
  formatType,
  parseType,
  validateInput,
  validateValue,
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

describe("findUnsafeIntegerLiterals", () => {
  it("finds integer literals beyond ±(2^53−1) with their position", () => {
    const text = '{\n  "a": [9007199254740991, -9007199254740992],\n  "b": 123456789012345678901\n}';
    expect(findUnsafeIntegerLiterals(text)).toEqual([
      { literal: "-9007199254740992", line: 2, column: 27 },
      { literal: "123456789012345678901", line: 3, column: 8 },
    ]);
  });

  it("ignores strings, fractions and exponents", () => {
    const text = '{"s": "99999999999999999999", "k\\"99999999999999999999": 1.5, "e": 1e300, "f": 99999999999999999999.5}';
    expect(findUnsafeIntegerLiterals(text)).toEqual([]);
  });
});
