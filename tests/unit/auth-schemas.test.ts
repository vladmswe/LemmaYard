import { describe, expect, it } from "vitest";

import {
  AUTH_MESSAGES,
  loginSchema,
  PASSWORD_HINT,
  registerSchema,
  USERNAME_RULE,
} from "@/lib/auth/schemas";

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

/** First issue message per field, as readJsonBody() reports it. */
function firstMessages(result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  const out: Record<string, string> = {};
  for (const issue of result.error?.issues ?? []) out[String(issue.path[0])] ??= issue.message;
  return out;
}

describe("auth copy (QA-1 D-06)", () => {
  it("uses one username rule for the hint and the error", () => {
    const errors = firstMessages(registerSchema.safeParse({ ...valid, username: "Al" }));
    expect(errors.username).toBe(USERNAME_RULE);
    expect(USERNAME_RULE).toBe("3–20 characters: lowercase letters, digits or underscore.");
  });

  it("says 'Email is required.' for an empty email on register and login", () => {
    expect(firstMessages(registerSchema.safeParse({ ...valid, email: "" })).email).toBe("Email is required.");
    expect(firstMessages(loginSchema.safeParse({ email: "", password: "x" })).email).toBe("Email is required.");
    expect(firstMessages(registerSchema.safeParse({ ...valid, email: "nope" })).email).toBe(
      "Enter a valid email address.",
    );
  });

  it("writes every field message as a sentence with a final period and no hyphen ranges", () => {
    const messages = [USERNAME_RULE, PASSWORD_HINT, ...Object.values(AUTH_MESSAGES)];
    for (const m of messages) {
      expect(m).toMatch(/^[A-Z0-9].*\.$/);
      expect(m).not.toMatch(/\d-\d/);
    }
    expect(firstMessages(registerSchema.safeParse({ ...valid, password: "short" })).password).toBe(
      AUTH_MESSAGES.passwordTooShort,
    );
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
