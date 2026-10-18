import { describe, expect, it } from "vitest";

import { identifierProblem } from "@/lib/problems/identifiers";
import { metaSchema, testsSchema } from "@/lib/problems/schema";

const meta = {
  number: 1,
  slug: "two-sum",
  title: "Two Sum",
  difficulty: "easy",
  tags: ["array", "hash-table"],
  signature: {
    name: "twoSum",
    params: [
      { name: "nums", type: "int[]" },
      { name: "target", type: "int" },
    ],
    returns: "int[]",
  },
  compare: { mode: "unordered" },
  limits: { timeMs: 2000, memoryMb: 256 },
};

const messages = (value: unknown) => {
  const result = metaSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
};

describe("metaSchema", () => {
  it("accepts the PLAN.md example and defaults limits", () => {
    expect(messages(meta)).toEqual([]);
    const { limits: _limits, ...rest } = meta;
    void _limits;
    expect(metaSchema.parse(rest).limits).toEqual({ timeMs: 2000, memoryMb: 256 });
  });

  it("requires epsilon for float compare", () => {
    expect(messages({ ...meta, compare: { mode: "float" } })).toEqual([
      'compare.epsilon: epsilon is required when compare.mode is "float"',
    ]);
    expect(messages({ ...meta, signature: { ...meta.signature, returns: "float" }, compare: { mode: "float", epsilon: 1e-6 } })).toEqual([]);
  });

  it("bounds number to 1..999999999", () => {
    expect(messages({ ...meta, number: 999_999_999 })).toEqual([]);
    expect(messages({ ...meta, number: 1_000_000_000 })[0]).toMatch(/^number: /);
    expect(messages({ ...meta, number: 0 })[0]).toMatch(/^number: /);
  });

  it("matches compare.mode to the return base type", () => {
    const withReturn = (returns: string, compare: unknown) =>
      messages({ ...meta, signature: { ...meta.signature, returns }, compare });
    const float = { mode: "float", epsilon: 1e-6 };
    for (const returns of ["float", "float[]", "float[][]"]) {
      expect(withReturn(returns, float)).toEqual([]);
      expect(withReturn(returns, { mode: "exact" })).toEqual([
        'compare.mode: "exact" cannot compare a float return type; use "float" with an epsilon',
      ]);
    }
    for (const returns of ["int", "int[]", "bool", "string[][]"]) {
      expect(withReturn(returns, float)).toEqual([
        'compare.mode: "float" requires a float return type (float, float[] or float[][])',
      ]);
      expect(withReturn(returns, { mode: "exact" })).toEqual([]);
    }
    expect(withReturn("int[][]", { mode: "unordered" })).toEqual([]);
    expect(withReturn("string", { mode: "unordered" })).toEqual([
      'compare.mode: "unordered" requires an array return type',
    ]);
  });

  it("rejects unknown keys, bad types and unordered with a scalar return", () => {
    expect(messages({ ...meta, extra: 1 })[0]).toMatch(/extra/);
    expect(messages({ ...meta, signature: { ...meta.signature, returns: "long" } })).toEqual([
      'signature.returns: unknown type "long" (use int, float, bool, string, T[] or T[][])',
    ]);
    expect(messages({ ...meta, signature: { ...meta.signature, returns: "int" } })).toEqual([
      'compare.mode: "unordered" requires an array return type',
    ]);
  });

  it("rejects invalid or reserved identifiers and duplicate params", () => {
    expect(messages({ ...meta, signature: { ...meta.signature, name: "two-sum" } })[0]).toMatch(
      /^signature\.name: .*not a valid identifier/,
    );
    expect(
      messages({ ...meta, signature: { ...meta.signature, params: [{ name: "lambda", type: "int" }] } })[0],
    ).toMatch(/^signature\.params\.0\.name: "lambda" is a reserved word/);
    expect(
      messages({
        ...meta,
        signature: { ...meta.signature, params: [{ name: "a", type: "int" }, { name: "a", type: "int" }] },
      }),
    ).toEqual(['signature.params.1.name: duplicate parameter name "a"']);
  });
});

describe("identifierProblem", () => {
  it.each(["nums", "_x", "twoSum", "a1", "match", "List"])("accepts %s", (name) =>
    expect(identifierProblem(name)).toBeNull(),
  );
  it.each(["1a", "a-b", "$x", "naïve", "", "a b"])("rejects invalid %j", (name) =>
    expect(identifierProblem(name)).toMatch(/not a valid identifier/),
  );
  it.each(["class", "def", "None", "lambda", "function", "var", "let", "typeof", "self", "arguments"])(
    "rejects reserved %s",
    (name) => expect(identifierProblem(name)).toMatch(/reserved word/),
  );
  it.each(["_", "long", "char", "boolean", "final", "synchronized", "throws", "goto"])(
    "rejects Java-only reserved %s",
    (name) => expect(identifierProblem(name)).toBe(`"${name}" is a reserved word in Java`),
  );
  it.each(["__init__", "__proto__", "__x", "__"])("rejects dunder-prefixed %s", (name) =>
    expect(identifierProblem(name)).toMatch(/starts with "__"/),
  );
  it.each([
    "JSON", "console", "Math", "Object", "Array", "Map", "Set", "Promise", "globalThis",
    "require", "module", "exports", "process", "Function", "Date", "BigInt",
    "input", "list", "dict", "set", "sum", "max", "min", "len", "id", "str", "int",
    "float", "range", "sorted", "print", "type", "object", "abs", "any", "all",
  ])("rejects global/builtin %s", (name) =>
    expect(identifierProblem(name)).toMatch(/would shadow a JavaScript global or Python builtin/),
  );
  it.each([
    "twoSum", "nums", "target", "s", "t", "n", "x", "prices", "height", "word1", "text1",
    "coins", "amount", "intervals", "_private", "a__b", "maxProfit", "values", "matrix",
  ])("keeps seed-style name %s valid", (name) => expect(identifierProblem(name)).toBeNull());
});

describe("testsSchema", () => {
  const test = (sample = false) => ({ input: { x: 1 }, expected: 1, sample });

  it("requires at least 5 tests and one sample", () => {
    expect(testsSchema.safeParse([test(true), test(), test(), test(), test()]).success).toBe(true);
    const few = testsSchema.safeParse([test(true), test(), test(), test()]);
    expect(few.error?.issues[0].message).toBe("at least 5 tests are required");
    const noSample = testsSchema.safeParse([test(), test(), test(), test(), test()]);
    expect(noSample.error?.issues[0].message).toBe('at least one test must have "sample": true');
  });

  it('rejects a "__proto__" input key as an unknown parameter', () => {
    const proto = JSON.parse('{"input": {"x": 1, "__proto__": 2}, "expected": 1}');
    const result = testsSchema.safeParse([proto, test(true), test(), test(), test()]);
    expect(result.error?.issues.map((i) => [i.path, i.message])).toEqual([
      [[0, "input"], 'unknown parameter "__proto__"'],
    ]);
  });

  it("requires expected", () => {
    const result = testsSchema.safeParse([{ input: {} }, test(true), test(), test(), test()]);
    expect(result.error?.issues[0].path).toEqual([0, "expected"]);
  });
});
