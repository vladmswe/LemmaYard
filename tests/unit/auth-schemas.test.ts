import { describe, expect, it } from "vitest";

import { loginSchema, registerSchema } from "@/lib/auth/schemas";

const valid = { email: "Alice@Example.COM", username: "alice_1", password: "s3cret-pass" };

describe("registerSchema", () => {
  it("lowercases and trims the email", () => {
    const out = registerSchema.parse({ ...valid, email: "  Alice@Example.COM " });
    expect(out.email).toBe("alice@example.com");
  });

  it.each([
    ["short username", { username: "ab" }],
    ["long username", { username: "a".repeat(21) }],
    ["uppercase username", { username: "Alice" }],
    ["username with dash", { username: "al-ice" }],
    ["short password", { password: "1234567" }],
    ["huge password", { password: "x".repeat(129) }],
    ["bad email", { email: "not-an-email" }],
    ["NUL in password", { password: "password\u0000" }],
    ["NUL in email", { email: "a\u0000@example.com" }],
    ["non-string", { password: 12345678 }],
  ])("rejects %s", (_name, override) => {
    expect(registerSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it("accepts boundary lengths", () => {
    expect(registerSchema.safeParse({ ...valid, username: "abc", password: "x".repeat(8) }).success).toBe(true);
    expect(registerSchema.safeParse({ ...valid, username: "a".repeat(20), password: "x".repeat(128) }).success).toBe(true);
  });
});

describe("loginSchema", () => {
  it("lowercases the email", () => {
    expect(loginSchema.parse({ email: "BOB@x.io", password: "whatever" }).email).toBe("bob@x.io");
  });

  it("requires both fields and rejects NUL", () => {
    expect(loginSchema.safeParse({ email: "a@b.c" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.c", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.c", password: "pass\u0000word" }).success).toBe(false);
  });
});
