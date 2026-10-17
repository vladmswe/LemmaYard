import { beforeAll, describe, expect, it, vi } from "vitest";

import { assertSameOrigin } from "@/server/http/request";

beforeAll(() => {
  // getEnv() is parsed lazily on first use, so stubbing here is enough.
  vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5433/db");
  vi.stubEnv("AUTH_SECRET", "x".repeat(32));
  vi.stubEnv("AUTH_URL", "http://localhost:3201/");
});

function request(headers: Record<string, string>) {
  return new Request("http://localhost:3201/api/auth/login", {
    method: "POST",
    headers,
    body: "{}",
  });
}

const JSON_CT = { "Content-Type": "application/json" };

describe("assertSameOrigin", () => {
  it("allows a JSON request without Origin", () => {
    expect(assertSameOrigin(request(JSON_CT))).toBeNull();
  });

  it("allows the AUTH_URL origin and a charset parameter", () => {
    expect(
      assertSameOrigin(
        request({ "Content-Type": "application/json; charset=utf-8", Origin: "http://localhost:3201" }),
      ),
    ).toBeNull();
  });

  it.each([
    "https://evil.com",
    "http://localhost:3000",
    "https://localhost:3201",
    "http://localhost:3201.evil.com",
    "null",
  ])("rejects foreign Origin %s with 403", async (origin) => {
    const res = assertSameOrigin(request({ ...JSON_CT, Origin: origin }));
    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ error: "Cross-origin request rejected" });
  });

  it.each([
    ["missing", {}],
    ["form", { "Content-Type": "application/x-www-form-urlencoded" }],
    ["text", { "Content-Type": "text/plain" }],
    ["multipart", { "Content-Type": "multipart/form-data; boundary=x" }],
    ["json lookalike", { "Content-Type": "application/jsonx" }],
  ])("rejects %s Content-Type with 403", (_name, headers: Record<string, string>) => {
    expect(assertSameOrigin(request(headers))?.status).toBe(403);
  });
});
