import { describe, expect, it } from "vitest";

import { isJudgeEnabled, parseEnv } from "@/server/env";

const required = {
  DATABASE_URL: "postgres://leetcopy:leetcopy@localhost:5433/leetcopy",
  AUTH_SECRET: "x".repeat(32),
};

describe("parseEnv", () => {
  it("applies defaults when only required variables are set", () => {
    const env = parseEnv(required);
    expect(env.PORT).toBe(3000);
    expect(env.WORKER_CONCURRENCY).toBe(2);
    expect(env.MAX_CODE_BYTES).toBe(65536);
    expect(env.LANG_TIME_MULT_PY).toBe(2);
    expect(env.AUTH_URL).toBe("http://localhost:3000");
  });

  it("coerces numeric strings and treats empty strings as unset", () => {
    const env = parseEnv({ ...required, PORT: "3001", PAGE_SIZE: "" });
    expect(env.PORT).toBe(3001);
    expect(env.PAGE_SIZE).toBe(20);
  });

  it("rejects missing or invalid variables with a readable message", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
    expect(() => parseEnv({ ...required, AUTH_SECRET: "short" })).toThrow(
      /AUTH_SECRET/,
    );
    expect(() => parseEnv({ ...required, PORT: "abc" })).toThrow(/PORT/);
  });
});

describe("isJudgeEnabled", () => {
  it.each([
    // JUDGE_ENABLED, VERCEL, expected
    [undefined, undefined, true],
    [undefined, "1", false],
    ["1", undefined, true],
    ["1", "1", true],
    ["0", undefined, false],
    ["0", "1", false],
  ] as const)("JUDGE_ENABLED=%s VERCEL=%s → %s", (judge, vercel, expected) => {
    expect(isJudgeEnabled({ JUDGE_ENABLED: judge, VERCEL: vercel })).toBe(expected);
  });

  it("parses through the env schema; empty means unset, other values are rejected", () => {
    expect(isJudgeEnabled(parseEnv({ ...required, VERCEL: "1" }))).toBe(false);
    expect(isJudgeEnabled(parseEnv({ ...required, VERCEL: "1", JUDGE_ENABLED: "1" }))).toBe(true);
    expect(isJudgeEnabled(parseEnv({ ...required, JUDGE_ENABLED: "" }))).toBe(true);
    expect(() => parseEnv({ ...required, JUDGE_ENABLED: "false" })).toThrow(/JUDGE_ENABLED/);
  });
});
