import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { AUTH_SECRET_PLACEHOLDER, isJudgeEnabled, parseEnv, weakSecretReason } from "@/server/env";

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

  it("JUDGE_EXECUTOR: docker by default; vercel-sandbox turns the judge on on Vercel unless JUDGE_ENABLED=0", () => {
    expect(parseEnv(required).JUDGE_EXECUTOR).toBe("docker");
    expect(() => parseEnv({ ...required, JUDGE_EXECUTOR: "vercel" })).toThrow(/JUDGE_EXECUTOR/);
    const sandbox = { ...required, VERCEL: "1", JUDGE_EXECUTOR: "vercel-sandbox" };
    expect(isJudgeEnabled(parseEnv(sandbox))).toBe(true);
    expect(isJudgeEnabled(parseEnv({ ...sandbox, JUDGE_ENABLED: "0" }))).toBe(false);
    expect(isJudgeEnabled(parseEnv({ ...required, VERCEL: "1", JUDGE_EXECUTOR: "docker" }))).toBe(false);
    expect(parseEnv(sandbox)).toMatchObject({
      VERCEL_SANDBOX_IMAGE_PYTHON: "vercel/sandbox/python:3.14",
      VERCEL_SANDBOX_IMAGE_NODE: "vercel/sandbox/node:22",
    });
  });
});

describe("AUTH_SECRET in production", () => {
  const prod = { ...required, NODE_ENV: "production", AUTH_URL: "https://lemmayard.example" };
  const strong = "Zq7mN2pR9vX4kL8sT1wY6bH3cF5gJ0dA";

  it.each([
    ["the .env.example placeholder", AUTH_SECRET_PLACEHOLDER, /placeholder/],
    ["a value containing change-me", "CHANGE-ME-please-0123456789abcdefghij", /change-me/],
    ["a low-entropy value", "abababababababababababababababab", /fewer than 12 distinct/],
  ])("rejects %s and never prints the value", (_label, secret, reason) => {
    let message = "";
    try {
      parseEnv({ ...prod, AUTH_SECRET: secret });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/AUTH_SECRET/);
    expect(message).toMatch(reason);
    expect(message).not.toContain(secret);
  });

  it("accepts a random secret and an AUTH_URL with a trailing slash", () => {
    const env = parseEnv({ ...prod, AUTH_SECRET: strong, AUTH_URL: "https://lemmayard.example/" });
    expect(new URL(env.AUTH_URL).origin).toBe("https://lemmayard.example");
  });

  it("is enforced on Vercel even with a localhost AUTH_URL", () => {
    expect(() =>
      parseEnv({ ...prod, VERCEL: "1", AUTH_URL: "http://localhost:3000", AUTH_SECRET: AUTH_SECRET_PLACEHOLDER }),
    ).toThrow(/AUTH_SECRET/);
  });

  it("keeps the placeholder working in development, test and a local production start", () => {
    for (const NODE_ENV of ["development", "test"]) {
      expect(parseEnv({ ...prod, NODE_ENV, AUTH_SECRET: AUTH_SECRET_PLACEHOLDER }).NODE_ENV).toBe(NODE_ENV);
    }
    for (const AUTH_URL of ["http://localhost:4901", "http://127.0.0.1:3000/", "http://[::1]:3000"]) {
      expect(parseEnv({ ...prod, AUTH_URL, AUTH_SECRET: AUTH_SECRET_PLACEHOLDER }).AUTH_URL).toBe(AUTH_URL);
    }
  });

  it("matches the value in .env.example", () => {
    const example = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
    expect(example).toContain(`AUTH_SECRET=${AUTH_SECRET_PLACEHOLDER}\n`);
  });

  it("weakSecretReason accepts strong secrets", () => {
    expect(weakSecretReason(strong)).toBeNull();
  });
});

describe("AUTH_RATE_LIMITS", () => {
  it("defaults to on and cannot be turned off on Vercel", () => {
    expect(parseEnv(required).AUTH_RATE_LIMITS).toBe("1");
    expect(parseEnv({ ...required, AUTH_RATE_LIMITS: "0" }).AUTH_RATE_LIMITS).toBe("0");
    expect(() => parseEnv({ ...required, VERCEL: "1", AUTH_RATE_LIMITS: "0" })).toThrow(/AUTH_RATE_LIMITS/);
  });
});

describe("community variables", () => {
  const strongSecret = "Qx7vLm2Rp9TzWk4Ns8Hd3Jf6Bc1Yg5Ae0Uo";
  const production = { ...required, AUTH_SECRET: strongSecret, VERCEL: "1", NODE_ENV: "production" };

  it("default to off and accept only 0 / 1", () => {
    const env = parseEnv(required);
    expect(env.COMMUNITY_ENABLED).toBe("0");
    expect(env.COMMUNITY_READ_ONLY).toBe("0");
    expect(env.CONTACT_EMAIL).toBeUndefined();
    const on = parseEnv({ ...required, COMMUNITY_ENABLED: "1", COMMUNITY_READ_ONLY: "1" });
    expect(on.COMMUNITY_ENABLED).toBe("1");
    expect(on.COMMUNITY_READ_ONLY).toBe("1");
    expect(() => parseEnv({ ...required, COMMUNITY_ENABLED: "true" })).toThrow(/COMMUNITY_ENABLED/);
    expect(() => parseEnv({ ...required, COMMUNITY_READ_ONLY: "true" })).toThrow(/COMMUNITY_READ_ONLY/);
  });

  it("CONTACT_EMAIL must be an email address", () => {
    expect(parseEnv({ ...required, CONTACT_EMAIL: "owner@example.com" }).CONTACT_EMAIL).toBe("owner@example.com");
    expect(() => parseEnv({ ...required, CONTACT_EMAIL: "not-an-email" })).toThrow(/CONTACT_EMAIL/);
  });

  it("requires CONTACT_EMAIL in production when the community is on", () => {
    expect(() => parseEnv({ ...production, COMMUNITY_ENABLED: "1" })).toThrow(/CONTACT_EMAIL/);
    expect(
      parseEnv({ ...production, COMMUNITY_ENABLED: "1", CONTACT_EMAIL: "owner@example.com" }).COMMUNITY_ENABLED,
    ).toBe("1");
    expect(parseEnv(production).COMMUNITY_ENABLED).toBe("0");
  });

  it("does not require CONTACT_EMAIL locally", () => {
    expect(parseEnv({ ...required, COMMUNITY_ENABLED: "1" }).CONTACT_EMAIL).toBeUndefined();
    expect(
      parseEnv({ ...required, COMMUNITY_ENABLED: "1", NODE_ENV: "production", AUTH_URL: "http://localhost:3000" })
        .COMMUNITY_ENABLED,
    ).toBe("1");
  });
});
