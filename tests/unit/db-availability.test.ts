import { describe, expect, it } from "vitest";

import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailable } from "@/server/db/availability";
import { internalServerError } from "@/server/http/request";

const withCode = (code: string, message = "boom") => Object.assign(new Error(message), { code });

describe("isDatabaseUnavailable", () => {
  it.each([
    ["ECONNREFUSED"],
    ["ENOTFOUND"],
    ["ETIMEDOUT"],
    ["ENETUNREACH"],
    ["28P01"], // wrong password
    ["3D000"], // database does not exist
    ["42P01"], // tables not created yet
    ["53300"], // too many connections
    ["57P03"],
    ["08006"], // connection exception class
    ["SELF_SIGNED_CERT_IN_CHAIN"],
  ])("treats %s as unavailable", (code) => {
    expect(isDatabaseUnavailable(withCode(code))).toBe(true);
  });

  it("recognises a Drizzle-wrapped pg error through its cause", () => {
    const wrapped = Object.assign(new Error('Failed query: insert into "users" params: secret@example.com'), {
      cause: withCode("ECONNREFUSED", "connect ECONNREFUSED 127.0.0.1:5432"),
    });
    expect(isDatabaseUnavailable(wrapped)).toBe(true);
  });

  it("recognises message-only failures (pool timeouts, bad env, pooler tenant errors)", () => {
    expect(isDatabaseUnavailable(new Error("timeout exceeded when trying to connect"))).toBe(true);
    expect(isDatabaseUnavailable(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isDatabaseUnavailable(new Error("Invalid environment variables: DATABASE_URL"))).toBe(true);
    expect(isDatabaseUnavailable(new Error("Tenant or user not found"))).toBe(true);
  });

  it("does not hide real bugs and data errors behind the 'unavailable' message", () => {
    expect(isDatabaseUnavailable(withCode("23505", "duplicate key"))).toBe(false); // unique violation
    expect(isDatabaseUnavailable(withCode("23514", "check violation"))).toBe(false);
    expect(isDatabaseUnavailable(new Error("deadlock detected"))).toBe(false);
    expect(isDatabaseUnavailable(new TypeError("x is not a function"))).toBe(false);
    expect(isDatabaseUnavailable("a string")).toBe(false);
    expect(isDatabaseUnavailable(undefined)).toBe(false);
  });
});

describe("internalServerError", () => {
  it("answers 503 with a plain message and Retry-After when the database is unavailable", async () => {
    const response = internalServerError("test.event", withCode("ECONNREFUSED"));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: DATABASE_UNAVAILABLE_MESSAGE });
  });

  it("keeps 500 for any other failure", async () => {
    const response = internalServerError("test.event", new Error("deadlock detected"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Something went wrong. Try again." });
  });
});
