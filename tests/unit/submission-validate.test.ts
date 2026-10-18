// Run/Submit request validation (PLAN.md section 6, steps 3–4; AC-M5-4/7).
import { describe, expect, it } from "vitest";

import { BASE_LANGUAGES, isLanguage, LANGUAGES } from "@/lib/submission-dto";
import { LANGUAGE_LABELS, languageList, MONACO_LANGUAGE } from "@/lib/workspace/languages";
import {
  byteLength,
  checkCustomInput,
  checkPayload,
  containsNul,
  MAX_CUSTOM_INPUT_BYTES,
  runBodySchema,
  submitBodySchema,
  type RunBody,
} from "@/server/submissions/validate";

const MAX = 65536;
const twoSum = {
  name: "twoSum",
  params: [
    { name: "nums", type: "int[]" },
    { name: "target", type: "int" },
  ],
  returns: "int[]",
};

const check = (body: RunBody, text = JSON.stringify(body)) => checkPayload(body, text, MAX);

describe("body schemas", () => {
  it("accepts a submit body and rejects extra or missing fields", () => {
    expect(submitBodySchema.safeParse({ language: "python", code: "x" }).success).toBe(true);
    expect(submitBodySchema.safeParse({ language: "python", code: "x", customInput: {} }).success).toBe(false);
    expect(submitBodySchema.safeParse({ language: "python" }).success).toBe(false);
    expect(submitBodySchema.safeParse({ language: "ruby", code: "x" }).success).toBe(false);
    expect(submitBodySchema.safeParse({ language: "python", code: "" }).success).toBe(false);
    expect(submitBodySchema.safeParse({ language: "python", code: 1 }).success).toBe(false);
    expect(submitBodySchema.safeParse([]).success).toBe(false);
  });

  it("accepts a run body with or without customInput", () => {
    expect(runBodySchema.safeParse({ language: "javascript", code: "x" }).success).toBe(true);
    expect(
      runBodySchema.safeParse({ language: "javascript", code: "x", customInput: { a: 1 } }).success,
    ).toBe(true);
    expect(runBodySchema.safeParse({ language: "javascript", code: "x", extra: 1 }).success).toBe(false);
  });
});

describe("code size in UTF-8 bytes", () => {
  it("counts bytes, not characters", () => {
    expect(byteLength("é")).toBe(2);
    expect(byteLength("😀")).toBe(4);
  });

  it("accepts exactly MAX_CODE_BYTES and rejects one byte more with 413", () => {
    expect(check({ language: "python", code: "a".repeat(MAX) })).toBeNull();
    expect(check({ language: "python", code: "a".repeat(MAX + 1) })?.status).toBe(413);
  });

  it("rejects multibyte code whose character count is under the limit", () => {
    // 32768 × 2 bytes = 65536 bytes: ok; 33000 × 2 bytes > 65536 although only 33000 characters.
    expect(check({ language: "python", code: "é".repeat(32768) })).toBeNull();
    const r = check({ language: "python", code: "é".repeat(33000) });
    expect(r?.status).toBe(413);
    expect(r?.fieldErrors?.code).toMatch(/65536 bytes/);
    expect(check({ language: "python", code: "😀".repeat(16385) })?.status).toBe(413);
  });
});

describe("custom input size", () => {
  it("allows 16 KB of serialized JSON and rejects more with 413", () => {
    const pad = (n: number) => ({ s: "x".repeat(n) });
    const overhead = byteLength(JSON.stringify(pad(0)));
    expect(check({ language: "python", code: "x", customInput: pad(MAX_CUSTOM_INPUT_BYTES - overhead) })).toBeNull();
    const r = check({ language: "python", code: "x", customInput: pad(MAX_CUSTOM_INPUT_BYTES - overhead + 1) });
    expect(r?.status).toBe(413);
  });

  it("counts multibyte characters as bytes", () => {
    const r = check({ language: "python", code: "x", customInput: { s: "é".repeat(8200) } });
    expect(r?.status).toBe(413);
  });
});

describe("NUL", () => {
  it("finds U+0000 in nested strings and keys", () => {
    expect(containsNul("a\u0000")).toBe(true);
    expect(containsNul({ a: ["ok", ["x\u0000"]] })).toBe(true);
    expect(containsNul({ ["k\u0000"]: 1 })).toBe(true);
    expect(containsNul({ a: ["\\u0000"] })).toBe(false);
    expect(containsNul({ a: [1, true, null] })).toBe(false);
  });

  it("rejects NUL in code or custom input with 400", () => {
    expect(check({ language: "python", code: "print(1)\u0000" })?.status).toBe(400);
    const r = check({ language: "python", code: "x", customInput: { s: "\u0000" } });
    expect(r?.status).toBe(400);
    expect(r?.fieldErrors?.customInput).toMatch(/NUL/);
  });

  it("checks size before NUL (413 wins)", () => {
    expect(check({ language: "python", code: "\u0000" + "a".repeat(MAX) })?.status).toBe(413);
  });
});

describe("number literals in custom input", () => {
  it("rejects integers beyond ±(2^53−1) that JSON.parse would round", () => {
    const text = '{"language":"python","code":"x","customInput":{"nums":[9007199254740993],"target":1}}';
    const body = JSON.parse(text) as RunBody;
    const r = checkPayload(body, text, MAX);
    expect(r?.status).toBe(400);
    expect(r?.error).toMatch(/Invalid custom input: integer 9007199254740993/);
  });

  it("ignores digits inside the code string", () => {
    const body = { language: "python" as const, code: "x = 9007199254740993", customInput: { a: 1 } };
    expect(check(body)).toBeNull();
  });
});

describe("checkCustomInput", () => {
  it("accepts a valid input", () => {
    expect(checkCustomInput({ nums: [1, 2], target: 3 }, twoSum)).toBeNull();
  });

  it("lists every field error in a readable message", () => {
    const r = checkCustomInput({ nums: [1, "2"], extra: true }, twoSum);
    expect(r?.status).toBe(400);
    expect(r?.error).toBe(
      'Invalid custom input: missing parameter "target"; unknown parameter "extra"; nums[1]: expected int, got string',
    );
    expect(r?.fieldErrors?.customInput).toContain("nums[1]: expected int, got string");
  });

  it("rejects non-objects", () => {
    expect(checkCustomInput([1, 2], twoSum)?.error).toBe("Invalid custom input: expected an object, got array");
    expect(checkCustomInput("x", twoSum)?.status).toBe(400);
  });
});

describe("languages", () => {
  it("accepts python, javascript and java, nothing else", () => {
    for (const language of ["python", "javascript", "java"]) {
      expect(submitBodySchema.safeParse({ language, code: "x" }).success).toBe(true);
      expect(runBodySchema.safeParse({ language, code: "x" }).success).toBe(true);
    }
    for (const language of ["Java", "kotlin", "", 1, null]) {
      const r = submitBodySchema.safeParse({ language, code: "x" });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.message).toBe("Language must be python, javascript or java");
    }
  });

  it("isLanguage guards stored values; Python and JavaScript are the base languages", () => {
    expect(LANGUAGES).toEqual(["python", "javascript", "java"]);
    expect(BASE_LANGUAGES).toEqual(["python", "javascript"]);
    expect(["python", "javascript", "java"].every(isLanguage)).toBe(true);
    expect([undefined, "JAVA", "c++", 3].some(isLanguage)).toBe(false);
  });

  it("names languages in running text", () => {
    expect(languageList(["python", "javascript", "java"], "or")).toBe("Python, JavaScript or Java");
    expect(languageList(["python", "javascript"], "and")).toBe("Python and JavaScript");
    expect(languageList(["java"], "or")).toBe("Java");
    expect(LANGUAGE_LABELS.java).toBe("Java");
    expect(MONACO_LANGUAGE.java).toEqual({ id: "java", file: "Solution.java" });
  });
});
