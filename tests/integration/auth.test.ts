// Auth integration tests (AC-M2-2/3/4/5/6/7): route handlers are called
// directly against the isolated test database; `next/headers` cookies() is
// replaced by a per-test cookie jar so getCurrentUser()/requireUser() can run
// outside a Next.js request.
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/server/db";
import { users } from "@/server/db/schema";

const state = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  cookies: new Map<string, string>(),
}));

vi.mock("@/server/db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/db")>();
  return { ...mod, getDb: () => state.db! };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined,
  }),
}));

import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as register } from "@/app/api/auth/register/route";
import SubmissionsPage from "@/app/(site)/submissions/page";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { getCurrentUser, requireUser } from "@/server/auth/session";
import { getEnv } from "@/server/env";

import { closeTestDb, createUser, getTestDb, resetTestDb } from "../helpers/db";

const ORIGIN = new URL(getEnv().AUTH_URL).origin;

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const alice = { email: "Alice@Example.com", username: "alice", password: "correct horse" };

/** Parses the session Set-Cookie header into its token and attributes. */
function sessionCookie(res: Response) {
  const header = res.headers.getSetCookie().find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!header) return null;
  const [pair, ...attrs] = header.split(";").map((s) => s.trim());
  return {
    value: pair.slice(SESSION_COOKIE.length + 1),
    attrs: attrs.map((a) => a.toLowerCase()),
  };
}

async function registerAlice() {
  const res = await register(post("/api/auth/register", alice));
  expect(res.status).toBe(201);
  return sessionCookie(res)!.value;
}

/** Simulates the browser sending `token` on the next request. */
function sendToken(token: string | null) {
  state.cookies.clear();
  if (token !== null) state.cookies.set(SESSION_COOKIE, token);
}

/** The redirect target encoded in a NEXT_REDIRECT error digest. */
async function redirectTarget(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2];
    throw error;
  }
  throw new Error("expected a redirect");
}

beforeAll(() => {
  state.db = getTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  sendToken(null);
});
afterAll(closeTestDb);

describe("POST /api/auth/register", () => {
  it("creates the user with a lowercased email and argon2id hash and sets a session cookie", async () => {
    const res = await register(post("/api/auth/register", alice));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.user.username).toBe("alice");

    const [row] = await getTestDb().select().from(users);
    expect(row.email).toBe("alice@example.com");
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row.passwordHash).not.toContain(alice.password);

    const cookie = sessionCookie(res)!;
    expect(cookie.value.split(".")).toHaveLength(3);
    expect(cookie.attrs).toEqual(
      expect.arrayContaining(["path=/", "httponly", "samesite=lax", `max-age=${7 * 24 * 3600}`]),
    );
    // Secure only in production (tests run with NODE_ENV=test).
    expect(cookie.attrs).not.toContain("secure");

    sendToken(cookie.value);
    expect(await getCurrentUser()).toMatchObject({ id: row.id, username: "alice" });
  });

  it("returns 409 with field errors for a duplicate email (any case) or username", async () => {
    await registerAlice();

    const dupEmail = await register(
      post("/api/auth/register", { ...alice, email: "ALICE@example.COM", username: "other" }),
    );
    expect(dupEmail.status).toBe(409);
    expect((await dupEmail.json()).fieldErrors).toEqual({
      email: "This email is already registered.",
    });

    const dupUsername = await register(
      post("/api/auth/register", { ...alice, email: "new@example.com" }),
    );
    expect(dupUsername.status).toBe(409);
    expect((await dupUsername.json()).fieldErrors).toEqual({ username: "This username is taken." });

    const both = await register(post("/api/auth/register", alice));
    expect(Object.keys((await both.json()).fieldErrors).sort()).toEqual(["email", "username"]);

    expect(await getTestDb().select().from(users)).toHaveLength(1);
  });

  it.each([
    ["short password", { ...alice, password: "short" }, "password"],
    ["bad username", { ...alice, username: "Al" }, "username"],
    ["bad email", { ...alice, email: "nope" }, "email"],
    ["NUL byte", { ...alice, username: "ali\u0000ce" }, "username"],
    ["missing field", { email: alice.email, password: alice.password }, "username"],
  ])("returns 400 for %s", async (_name, body, field) => {
    const res = await register(post("/api/auth/register", body));
    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors[field]).toEqual(expect.any(String));
    expect(sessionCookie(res)).toBeNull();
    expect(await getTestDb().select().from(users)).toHaveLength(0);
  });

  it("returns 400 for malformed JSON and 413 for an oversized body", async () => {
    expect((await register(post("/api/auth/register", "{not json"))).status).toBe(400);
    const huge = { ...alice, password: "x".repeat(10_000) };
    expect((await register(post("/api/auth/register", huge))).status).toBe(413);
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with any email casing and sets a session cookie", async () => {
    await registerAlice();
    const res = await login(
      post("/api/auth/login", { email: "ALICE@EXAMPLE.COM", password: alice.password }),
    );
    expect(res.status).toBe(200);
    const cookie = sessionCookie(res)!;
    expect(cookie.attrs).toEqual(expect.arrayContaining(["httponly", "samesite=lax", "path=/"]));
    sendToken(cookie.value);
    expect((await getCurrentUser())?.username).toBe("alice");
  });

  it("returns the same 401 for a wrong password and an unknown email", async () => {
    await registerAlice();
    const wrong = await login(post("/api/auth/login", { email: alice.email, password: "wrong pass" }));
    const unknown = await login(
      post("/api/auth/login", { email: "nobody@example.com", password: "wrong pass" }),
    );
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    const expected = { error: "Invalid email or password" };
    expect(await wrong.json()).toEqual(expected);
    expect(await unknown.json()).toEqual(expected);
    expect(sessionCookie(wrong)).toBeNull();
    expect(sessionCookie(unknown)).toBeNull();
  });

  it("returns 400 for a missing password", async () => {
    const res = await login(post("/api/auth/login", { email: alice.email }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the session cookie", async () => {
    await registerAlice();
    const res = await logout(post("/api/auth/logout", ""));
    expect(res.status).toBe(200);
    const cookie = sessionCookie(res)!;
    expect(cookie.value).toBe("");
    expect(cookie.attrs).toEqual(expect.arrayContaining(["max-age=0", "path=/", "httponly"]));
  });
});

describe("same-origin guard on auth routes", () => {
  it.each([
    ["register", register, "/api/auth/register"],
    ["login", login, "/api/auth/login"],
    ["logout", logout, "/api/auth/logout"],
  ] as const)("%s: foreign Origin and non-JSON Content-Type → 403", async (_n, handler, path) => {
    const foreign = await handler(post(path, alice, { Origin: "https://evil.example" }));
    expect(foreign.status).toBe(403);
    const form = await handler(
      post(path, "email=a", { "Content-Type": "application/x-www-form-urlencoded" }),
    );
    expect(form.status).toBe(403);
    expect(sessionCookie(foreign)).toBeNull();
  });

  it("allows the own Origin and a missing Origin", async () => {
    const own = await register(post("/api/auth/register", alice, { Origin: ORIGIN }));
    expect(own.status).toBe(201);
    const none = await login(post("/api/auth/login", { email: alice.email, password: alice.password }));
    expect(none.status).toBe(200);
    expect(await getTestDb().select().from(users)).toHaveLength(1);
  });

  it("does not create a user for a cross-origin register", async () => {
    await register(post("/api/auth/register", alice, { Origin: "https://evil.example" }));
    expect(await getTestDb().select().from(users)).toHaveLength(0);
  });
});

describe("session tokens", () => {
  const secret = () => new TextEncoder().encode(getEnv().AUTH_SECRET);

  async function token(sub: string, opts: { exp?: string | number; key?: Uint8Array } = {}) {
    return new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(sub)
      .setIssuer("lemmayard")
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "1h")
      .sign(opts.key ?? secret());
  }

  it("accepts a token signed with AUTH_SECRET", async () => {
    const user = await createUser({ username: "bob" });
    sendToken(await token(user.id));
    expect((await getCurrentUser())?.username).toBe("bob");
  });

  it("treats forged, expired, tampered and garbage tokens as guest", async () => {
    const user = await createUser({ username: "bob" });
    const valid = await token(user.id);
    const [h, , s] = valid.split(".");
    const otherPayload = Buffer.from(JSON.stringify({ sub: user.id, iss: "lemmayard", exp: 9999999999 })).toString("base64url");
    const unsigned = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${otherPayload}.`;

    for (const bad of [
      await token(user.id, { key: new TextEncoder().encode("y".repeat(32)) }),
      await token(user.id, { exp: Math.floor(Date.now() / 1000) - 60 }),
      `${h}.${otherPayload}.${s}`,
      unsigned,
      "garbage",
      await token("not-a-uuid"),
    ]) {
      sendToken(bad);
      expect(await getCurrentUser()).toBeNull();
    }
  });

  it("treats a valid token of a deleted user as guest", async () => {
    const user = await createUser({ username: "bob" });
    sendToken(await token(user.id));
    await getTestDb().delete(users).where(eq(users.id, user.id));
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("protected route /submissions", () => {
  it("redirects a guest to /login?next=/submissions", async () => {
    expect(await redirectTarget(SubmissionsPage())).toBe("/login?next=%2Fsubmissions");
    expect(await redirectTarget(requireUser("/a b"))).toBe("/login?next=%2Fa%20b");
  });

  it("redirects a forged token to login and renders for a signed-in user", async () => {
    sendToken("forged.token.value");
    expect(await redirectTarget(SubmissionsPage())).toBe("/login?next=%2Fsubmissions");

    sendToken(await registerAlice());
    await expect(SubmissionsPage()).resolves.toBeTruthy();
    expect((await requireUser("/submissions")).username).toBe("alice");
  });
});
