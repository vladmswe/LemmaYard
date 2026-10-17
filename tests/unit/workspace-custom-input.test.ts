// Custom input for Run (AC-M5-4): per-parameter JSON, shared validator,
// readable errors, same limits as the server.
import { describe, expect, it } from "vitest";

import { checkCustomInput } from "@/server/submissions/validate";
import {
  customInputSummary,
  fieldsFromInput,
  parseCustomInput,
} from "@/lib/workspace/custom-input";

const signature = {
  name: "twoSum",
  params: [
    { name: "nums", type: "int[]" },
    { name: "target", type: "int" },
  ],
  returns: "int[]",
};

const all = {
  name: "f",
  params: [
    { name: "a", type: "float" },
    { name: "b", type: "bool" },
    { name: "s", type: "string" },
    { name: "g", type: "int[][]" },
  ],
  returns: "int",
};

describe("fieldsFromInput", () => {
  it("prefills each parameter with readable JSON", () => {
    expect(fieldsFromInput(signature, { nums: [2, 7, 11], target: 9 })).toEqual({ nums: "[2, 7, 11]", target: "9" });
    expect(fieldsFromInput(all, { a: 1.5, b: true, s: "x\"y", g: [[1], []] })).toEqual({
      a: "1.5",
      b: "true",
      s: '"x\\"y"',
      g: "[[1], []]",
    });
  });

  it("leaves missing parameters empty", () => {
    expect(fieldsFromInput(signature, {})).toEqual({ nums: "", target: "" });
  });
});

describe("parseCustomInput", () => {
  it("builds the object keyed by parameter names", () => {
    const r = parseCustomInput(signature, { nums: "[2, 7, 11, 15]", target: " 9 " });
    expect(r).toEqual({ ok: true, input: { nums: [2, 7, 11, 15], target: 9 } });
    // The server accepts what the client accepts.
    if (r.ok) expect(checkCustomInput(r.input, signature)).toBeNull();
  });

  it("round-trips every sample-like value", () => {
    const input = { a: 0.25, b: false, s: "héllo", g: [[1, 2], [3]] };
    expect(parseCustomInput(all, fieldsFromInput(all, input))).toEqual({ ok: true, input });
  });

  it("reports per-field errors in plain words", () => {
    const r = parseCustomInput(signature, { nums: "[1, 2", target: "" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.fieldErrors.nums).toMatch(/Not valid JSON/);
    expect(r.fieldErrors.target).toBe("Enter a value");
  });

  it("uses the shared type validator", () => {
    const r = parseCustomInput(signature, { nums: '[1, "2"]', target: "1.5" });
    if (r.ok) throw new Error("expected errors");
    expect(r.fieldErrors.nums).toBe("nums[1]: expected int, got string");
    expect(r.fieldErrors.target).toBe("expected int, got non-integer number");
    const wrongShape = parseCustomInput(signature, { nums: "3", target: "1" });
    if (wrongShape.ok) throw new Error("expected errors");
    expect(wrongShape.fieldErrors.nums).toBe("expected int[], got integer");
  });

  it("rejects numbers JSON.parse would silently change", () => {
    const r = parseCustomInput(signature, { nums: "[9007199254740993]", target: "1" });
    if (r.ok) throw new Error("expected errors");
    expect(r.fieldErrors.nums).toMatch(/outside the range/);
  });

  it("rejects NUL characters like the server", () => {
    const r = parseCustomInput(all, { a: "1", b: "true", s: '"a\\u0000b"', g: "[]" });
    if (r.ok) throw new Error("expected errors");
    expect(r.fieldErrors.s).toMatch(/NUL/);
  });

  it("enforces the 16 KB limit on the serialized object", () => {
    const big = `[${Array.from({ length: 4000 }, () => "1234").join(",")}]`;
    const r = parseCustomInput(signature, { nums: big, target: "1" });
    if (r.ok) throw new Error("expected errors");
    expect(r.formError).toMatch(/too large/);
    expect(customInputSummary(r)).toMatch(/too large/);
  });

  it("summarizes the first problem for the Run tooltip", () => {
    expect(customInputSummary(parseCustomInput(signature, { nums: "[1]", target: "1" }))).toBeNull();
    expect(customInputSummary(parseCustomInput(signature, { nums: "x", target: "1" }))).toMatch(
      /^Fix the custom input: nums: Not valid JSON/,
    );
  });
});
