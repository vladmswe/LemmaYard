// WP-3: login/register rate limits (src/server/auth/rate-limit.ts). Route
// handlers run against the isolated test database; argon2 is wrapped with
// call counters to prove a blocked request does no hashing.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/server/db";

const state = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  argon2: { hash: 0, verify: 0 },
}));

vi.mock("@/server/db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/db")>();
  return { ...mod, getDb: () => state.db! };
});

vi.mock("@node-rs/argon2", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@node-rs/argon2")>();
  return {
    ...mod,
    hash: (...args: Parameters<typeof mod.hash>) => {
      state.argon2.hash += 1;
      return mod.hash(...args);
    },
    verify: (...args: Parameters<typeof mod.verify>) => {
      state.argon2.verify += 1;
      return mod.verify(...args);
    },
  };
});

import { POST as login } from "@/app/api/auth/login/route";
import { POST as register } from "@/app/api/auth/register/route";
import { AUTH_LIMITS, resetAuthLimits } from "@/server/auth/rate-limit";
import { getEnv } from "@/server/env";

import { closeTestDb, getTestDb, resetTestDb } from "../helpers/db";

const ORIGIN = new URL(getEnv().AUTH_URL).origin;
const PASSWORD = "correct horse";

function post(path: string, body: unknown, address = "203.0.113.10") {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Forwarded-For": `${address}, 10.0.0.1` },
    body: JSON.stringify(body),
  });
}

const loginAs = (email: string, password: string, address?: string) =>
  login(post("/api/auth/login", { email, password }, address));

let registered = 0;
async function registerUser(email: string) {
  // Each registration from its own address so the register limits stay out of the way.
  registered += 1;
  const res = await register(
    post("/api/auth/register", { email, username: `user_${registered}`, password: PASSWORD }, `198.51.100.${registered}`),
  );
  expect(res.status).toBe(201);
}

async function failLogins(n: number, email: string, address?: string) {
  for (let i = 0; i < n; i += 1) {
    expect((await loginAs(email, "wrong password", address)).status).toBe(401);
  }
}

beforeAll(() => {
  state.db = getTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  resetAuthLimits();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-18T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});
afterAll(closeTestDb);

describe("login rate limit", () => {
  it("returns 429 with Retry-After after 10 failures for one address + email, before any argon2 work", async () => {
    await registerUser("alice@example.com");
    expect(AUTH_LIMITS.loginPerAddressEmail.limit).toBe(10);
    await failLogins(10, "alice@example.com");

    state.argon2.verify = 0;
    const blocked = await loginAs("alice@example.com", PASSWORD);
    expect(blocked.status).toBe(429);
    expect(state.argon2.verify).toBe(0);
    expect(Number(blocked.headers.get("Retry-After"))).toBe(15 * 60);
    expect(blocked.headers.get("Cache-Control")).toBe("no-store");
    expect(await blocked.json()).toEqual({ error: "Too many login attempts. Try again in 15 min." });
    expect(blocked.headers.getSetCookie()).toEqual([]);

    // Retry-After shrinks with time and the window frees up when it says so.
    vi.setSystemTime(new Date("2026-10-18T12:10:00Z"));
    const later = await loginAs("alice@example.com", PASSWORD);
    expect(Number(later.headers.get("Retry-After"))).toBe(5 * 60);
    vi.setSystemTime(new Date("2026-10-18T12:15:01Z"));
    expect((await loginAs("alice@example.com", PASSWORD)).status).toBe(200);
  });

  it("counts per key: another address or another email is unaffected", async () => {
    await registerUser("alice@example.com");
    await registerUser("bob@example.com");
    await failLogins(10, "alice@example.com");
    expect((await loginAs("alice@example.com", PASSWORD)).status).toBe(429);
    expect((await loginAs("alice@example.com", PASSWORD, "203.0.113.99")).status).toBe(200);
    expect((await loginAs("bob@example.com", PASSWORD)).status).toBe(200);
    // Email keys are normalised by the schema: casing does not open a new bucket.
    expect((await loginAs("ALICE@Example.com ", PASSWORD)).status).toBe(429);
  });

  it("gives the identical 429 for an unknown email and for a wrong password", async () => {
    await registerUser("alice@example.com");
    await failLogins(10, "alice@example.com", "203.0.113.1");
    await failLogins(10, "nobody@example.com", "203.0.113.2");
    const known = await loginAs("alice@example.com", "wrong password", "203.0.113.1");
    const unknown = await loginAs("nobody@example.com", "wrong password", "203.0.113.2");
    expect(known.status).toBe(429);
    expect(unknown.status).toBe(429);
    expect(await known.json()).toEqual(await unknown.json());
    expect(known.headers.get("Retry-After")).toBe(unknown.headers.get("Retry-After"));
  });

  it("does not count successful logins, and a success before the limit still works", async () => {
    await registerUser("alice@example.com");
    for (let i = 0; i < 15; i += 1) {
      expect((await loginAs("alice@example.com", PASSWORD)).status).toBe(200);
    }
    await failLogins(9, "alice@example.com");
    expect((await loginAs("alice@example.com", PASSWORD)).status).toBe(200);
  });

  it("limits one address to 30 failures across all emails", async () => {
    await registerUser("alice@example.com");
    expect(AUTH_LIMITS.loginPerAddress.limit).toBe(30);
    for (let i = 0; i < 30; i += 1) {
      expect((await loginAs(`guess${i}@example.com`, "wrong password")).status).toBe(401);
    }
    expect((await loginAs("alice@example.com", PASSWORD)).status).toBe(429);
    expect((await loginAs("alice@example.com", PASSWORD, "203.0.113.77")).status).toBe(200);
  });

  it("shares one bucket for requests without any address header", async () => {
    const bare = (email: string) =>
      login(
        new Request(`${ORIGIN}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: "wrong password" }),
        }),
      );
    for (let i = 0; i < 10; i += 1) expect((await bare("x@example.com")).status).toBe(401);
    expect((await bare("x@example.com")).status).toBe(429);
  });
});

describe("register rate limit", () => {
  it("allows 3 attempts per address + email per hour, then 429 before hashing", async () => {
    expect(AUTH_LIMITS.registerPerAddressEmail.limit).toBe(3);
    const attempt = (username: string) =>
      register(post("/api/auth/register", { email: "carol@example.com", username, password: PASSWORD }));
    expect((await attempt("carol")).status).toBe(201);
    expect((await attempt("carol2")).status).toBe(409);
    expect((await attempt("carol3")).status).toBe(409);
    state.argon2.hash = 0;
    const blocked = await attempt("carol4");
    expect(blocked.status).toBe(429);
    expect(state.argon2.hash).toBe(0);
    expect(Number(blocked.headers.get("Retry-After"))).toBe(60 * 60);
    expect(await blocked.json()).toEqual({ error: "Too many sign-up attempts. Try again in 60 min." });
  });

  it("allows 5 registrations per address per hour; other addresses are unaffected", async () => {
    expect(AUTH_LIMITS.registerPerAddress.limit).toBe(5);
    const attempt = (i: number, address?: string) =>
      register(
        post("/api/auth/register", { email: `u${i}@example.com`, username: `user_r${i}`, password: PASSWORD }, address),
      );
    for (let i = 0; i < 5; i += 1) expect((await attempt(i)).status).toBe(201);
    vi.setSystemTime(new Date("2026-10-18T12:20:00Z"));
    const blocked = await attempt(5);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBe(40 * 60);
    expect((await attempt(6, "192.0.2.50")).status).toBe(201);
  });

  it("does not count requests rejected by validation", async () => {
    for (let i = 0; i < 6; i += 1) {
      const res = await register(post("/api/auth/register", { email: "bad", username: "x", password: "y" }));
      expect(res.status).toBe(400);
    }
    const ok = await register(
      post("/api/auth/register", { email: "dave@example.com", username: "dave", password: PASSWORD }),
    );
    expect(ok.status).toBe(201);
  });
});
