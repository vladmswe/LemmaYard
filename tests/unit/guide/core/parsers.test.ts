import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { parseChoice, parseIntList, parseOpScript, parseWordList } from "@/lib/guide/input/parsers";
import { numRuns } from "@/lib/guide/testing/fc";

const INTS = { min: -99, max: 999, maxCount: 12 };

describe("parseIntList", () => {
  it("accepts commas and/or spaces", () => {
    expect(parseIntList("5, 3, 8", INTS)).toEqual({ ok: true, value: [5, 3, 8] });
    expect(parseIntList(" 5 3,8 ", INTS)).toEqual({ ok: true, value: [5, 3, 8] });
    expect(parseIntList("-4, +7", INTS)).toEqual({ ok: true, value: [-4, 7] });
  });
  it("rejects non-integers with the position", () => {
    expect(parseIntList("1, x, 3", INTS)).toEqual({ ok: false, error: "Number 2: 'x' is not a whole number" });
    expect(parseIntList("1.5", INTS)).toMatchObject({ ok: false });
  });
  it("rejects values out of range", () => {
    expect(parseIntList("1, 1000", INTS)).toEqual({ ok: false, error: "Number 2: 1000 is out of range (-99 to 999)" });
  });
  it("rejects too many and too few", () => {
    const thirteen = Array.from({ length: 13 }, (_, i) => i).join(", ");
    expect(parseIntList(thirteen, INTS)).toEqual({ ok: false, error: "Too many numbers: 13 (at most 12)" });
    expect(parseIntList("  ", INTS)).toEqual({ ok: false, error: "Enter at least one number" });
    expect(parseIntList("1", { ...INTS, minCount: 2 })).toEqual({ ok: false, error: "Enter at least 2 numbers" });
  });
  it("round-trips any valid list (property)", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -99, max: 999 }), { minLength: 1, maxLength: 12 }), (xs) => {
        expect(parseIntList(xs.join(", "), INTS)).toEqual({ ok: true, value: xs.map((x) => (x === 0 ? 0 : x)) });
      }),
      { numRuns: numRuns(200) },
    );
  });
  it("never throws on arbitrary text (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (raw) => {
        const r = parseIntList(raw, INTS);
        if (r.ok) expect(r.value.length).toBeLessThanOrEqual(12);
        else expect(r.error.length).toBeGreaterThan(0);
      }),
      { numRuns: numRuns(200) },
    );
  });
});

describe("parseWordList", () => {
  it("lower-cases and accepts a-z words", () => {
    expect(parseWordList("Cat, car dog", { maxCount: 5 })).toEqual({ ok: true, value: ["cat", "car", "dog"] });
  });
  it("rejects other characters, long words and too many words", () => {
    expect(parseWordList("cat, d0g", { maxCount: 5 })).toEqual({ ok: false, error: "Word 2: 'd0g' must use only letters a-z" });
    expect(parseWordList("abcdefghi", { maxCount: 5 })).toEqual({
      ok: false,
      error: "Word 1: 'abcdefghi' is longer than 8 letters",
    });
    expect(parseWordList("a b c", { maxCount: 2 })).toEqual({ ok: false, error: "Too many words: 3 (at most 2)" });
  });
});

describe("parseOpScript", () => {
  const spec = { push: ["int"], pop: [], peek: [] } as const;
  const o = { min: -99, max: 999, maxOps: 5 };
  it("parses commas or newlines, case-insensitive op names", () => {
    expect(parseOpScript("push 3, PUSH 5\npop", spec, o)).toEqual({
      ok: true,
      value: [
        { op: "push", args: [3] },
        { op: "push", args: [5] },
        { op: "pop", args: [] },
      ],
    });
  });
  it("names an unknown op precisely", () => {
    expect(parseOpScript("push 1, push 2, pish 3", spec, o)).toEqual({
      ok: false,
      error: "Op 3 'pish' is not one of push, pop, peek",
    });
  });
  it("checks argument count and type", () => {
    expect(parseOpScript("push", spec, o)).toEqual({ ok: false, error: "Op 1 'push' takes 1 argument, got 0" });
    expect(parseOpScript("pop 3", spec, o)).toEqual({ ok: false, error: "Op 1 'pop' takes 0 arguments, got 1" });
    expect(parseOpScript("push x", spec, o)).toEqual({ ok: false, error: "Op 1 'push': 'x' is not a whole number" });
    expect(parseOpScript("push 5000", spec, o)).toEqual({
      ok: false,
      error: "Op 1 'push': 5000 is out of range (-99 to 999)",
    });
  });
  it("supports word arguments", () => {
    const words = { insert: ["word"], has: ["word"] } as const;
    expect(parseOpScript("insert Car, has cat", words, o)).toEqual({
      ok: true,
      value: [
        { op: "insert", args: ["car"] },
        { op: "has", args: ["cat"] },
      ],
    });
  });
  it("caps the number of ops and requires at least one", () => {
    expect(parseOpScript("pop, pop, pop, pop, pop, pop", spec, o)).toEqual({
      ok: false,
      error: "Too many ops: 6 (at most 5)",
    });
    expect(parseOpScript(" , ", spec, o)).toEqual({ ok: false, error: "Enter at least one op (push, pop, peek)" });
  });
  it("does not accept inherited object keys as ops", () => {
    expect(parseOpScript("toString", spec, o)).toMatchObject({ ok: false });
  });
});

describe("parseChoice", () => {
  it("matches case-insensitively", () => {
    expect(parseChoice(" Chaining ", ["chaining", "linear"])).toEqual({ ok: true, value: "chaining" });
    expect(parseChoice("cuckoo", ["chaining", "linear"])).toEqual({
      ok: false,
      error: "'cuckoo' is not one of chaining, linear",
    });
  });
});
