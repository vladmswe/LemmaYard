// "Judge disabled" mode (JUDGE_ENABLED=0, the Vercel default) through the real
// route handlers and the test database: Run / Submit / session start answer
// 503 `judge_disabled` after the Origin and session checks and before
// anything else, and write nothing. Lobby creation, drawing and joining stay
// allowed. The other suites run with JUDGE_ENABLED=1 (vitest.integration.config.mts).
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/server/db";

const state = vi.hoisted(() => {
  // Before anything reads getEnv() in this file's module graph.
  process.env.JUDGE_ENABLED = "0";
  return { db: undefined as Db | undefined, cookies: new Map<string, string>() };
});

vi.mock("@/server/db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/db")>();
  return { ...mod, getDb: () => state.db! };
});

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.cookies.has(name) ? { name, value: state.cookies.get(name)! } : undefined),
  }),
}));

import { GET as healthRoute } from "@/app/api/health/route";
import { POST as runRoute } from "@/app/api/problems/[slug]/run/route";
import { POST as submitRoute } from "@/app/api/problems/[slug]/submit/route";
import { POST as drawRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/draw/route";
import { POST as joinRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/join/route";
import { POST as startRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/start/route";
import { POST as createSessionRoute } from "@/app/api/rooms/[roomId]/sessions/route";
import { JUDGE_DISABLED_API_MESSAGE, JUDGE_DISABLED_SESSION_MESSAGE } from "@/lib/judge-availability";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { signSessionToken } from "@/server/auth/token";
import { roomSessions, submissions } from "@/server/db/schema";
import { getEnv, isJudgeEnabled } from "@/server/env";

import { closeTestDb, createProblem, createSubmission, createTestCases, createUser, getTestDb, resetTestDb } from "../helpers/db";
import { createRoom } from "../helpers/rooms";

const ORIGIN = new URL(getEnv().AUTH_URL).origin;
const CODE = "class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]\n";
const OK_BODY = { language: "python", code: CODE };

type Kind = "run" | "submit";
type User = Awaited<ReturnType<typeof createUser>>;

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

function call(kind: Kind, body: unknown = OK_BODY, headers?: Record<string, string>) {
  const route = kind === "run" ? runRoute : submitRoute;
  return route(post(`/api/problems/two-sum/${kind}`, body, headers), params({ slug: "two-sum" }));
}

const base = (r: string, s: string) => `/api/rooms/${r}/sessions/${s}`;
const rooms = {
  create: (r: string, body: unknown = {}) => createSessionRoute(post(`/api/rooms/${r}/sessions`, body), params({ roomId: r })),
  draw: (r: string, s: string, body: unknown = {}) => drawRoute(post(`${base(r, s)}/draw`, body), params({ roomId: r, sessionId: s })),
  join: (r: string, s: string, headers?: Record<string, string>) =>
    joinRoute(post(`${base(r, s)}/join`, {}, headers), params({ roomId: r, sessionId: s })),
  start: (r: string, s: string, headers?: Record<string, string>) =>
    startRoute(post(`${base(r, s)}/start`, {}, headers), params({ roomId: r, sessionId: s })),
};

async function signIn(user: User | null) {
  state.cookies.clear();
  if (user) state.cookies.set(SESSION_COOKIE, await signSessionToken(user.id));
}

/** Everything Run / Submit / start could write. */
async function dbSnapshot() {
  const { rows } = await getTestDb().execute(sql`
    SELECT
      (SELECT coalesce(json_agg(s ORDER BY s.id), '[]') FROM submissions s) AS submissions,
      (SELECT coalesce(json_agg(s ORDER BY s.id), '[]') FROM room_sessions s) AS sessions,
      (SELECT coalesce(json_agg(p ORDER BY p.session_id, p.user_id), '[]') FROM room_session_participants p) AS participants,
      (SELECT coalesce(json_agg(e ORDER BY e.id), '[]') FROM room_events e) AS events
  `);
  return JSON.stringify(rows[0]);
}

async function expectJudgeDisabled(res: Response, error: string) {
  expect(res.status).toBe(503);
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(await res.json()).toEqual({ error, code: "judge_disabled" });
}

let problem: Awaited<ReturnType<typeof createProblem>>;
let user: User;

beforeAll(() => {
  state.db = getTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  problem = await createProblem({ slug: "two-sum", title: "Two Sum" });
  await createTestCases(problem.id, 3);
  user = await createUser();
  await signIn(user);
});
afterAll(async () => {
  process.env.JUDGE_ENABLED = "1";
  await closeTestDb();
});

it("this file runs with the judge disabled", () => {
  expect(isJudgeEnabled(getEnv())).toBe(false);
});

describe("Run / Submit with the judge disabled", () => {
  it.each<Kind>(["run", "submit"])("%s → 503 judge_disabled, no row", async (kind) => {
    await expectJudgeDisabled(await call(kind), JUDGE_DISABLED_API_MESSAGE);
    expect(await getTestDb().$count(submissions)).toBe(0);
  });

  it.each<Kind>(["run", "submit"])("%s: repeated calls stay 503, never 429", async (kind) => {
    const limit = Math.max(getEnv().MAX_ACTIVE_PER_USER, getEnv().RUN_RATE_PER_MIN, getEnv().SUBMIT_RATE_PER_MIN) + 2;
    for (let i = 0; i < limit; i++) {
      const res = await call(kind);
      expect(res.status).toBe(503);
      expect(res.headers.get("retry-after")).toBeNull();
    }
    expect(await getTestDb().$count(submissions)).toBe(0);
  });

  it("rows already stuck in queued are left alone and do not turn the answer into 429", async () => {
    for (let i = 0; i < getEnv().MAX_ACTIVE_PER_USER; i++) {
      await createSubmission({ userId: user.id, problemId: problem.id, status: "queued" });
    }
    const before = await dbSnapshot();
    await expectJudgeDisabled(await call("submit"), JUDGE_DISABLED_API_MESSAGE);
    await expectJudgeDisabled(await call("run"), JUDGE_DISABLED_API_MESSAGE);
    expect(await dbSnapshot()).toBe(before);
    const statuses = await getTestDb().select({ status: submissions.status }).from(submissions);
    expect(statuses.map((s) => s.status)).toEqual(["queued", "queued"]);
  });

  it("checked before the body: an invalid body or unknown problem is still 503", async () => {
    await expectJudgeDisabled(await call("run", "{not json"), JUDGE_DISABLED_API_MESSAGE);
    const res = await submitRoute(post("/api/problems/nope/submit", OK_BODY), params({ slug: "nope" }));
    expect(res.status).toBe(503);
  });

  it.each<Kind>(["run", "submit"])("%s: wrong Content-Type / foreign Origin → 403 first", async (kind) => {
    expect((await call(kind, OK_BODY, { "Content-Type": "text/plain" })).status).toBe(403);
    expect((await call(kind, OK_BODY, { Origin: "http://evil.example" })).status).toBe(403);
    await signIn(null);
    expect((await call(kind, OK_BODY, { Origin: "http://evil.example" })).status).toBe(403);
  });

  it.each<Kind>(["run", "submit"])("%s: no session → 401 first", async (kind) => {
    await signIn(null);
    const res = await call(kind);
    expect(res.status).toBe(401);
    expect(await getTestDb().$count(submissions)).toBe(0);
  });

  it("submit with a roomSessionId → the same 503", async () => {
    const res = await call("submit", { ...OK_BODY, roomSessionId: "00000000-0000-4000-8000-000000000000" });
    await expectJudgeDisabled(res, JUDGE_DISABLED_API_MESSAGE);
    expect(await getTestDb().$count(submissions)).toBe(0);
  });
});

describe("room sessions with the judge disabled", () => {
  let alice: User;
  let bob: User;
  let roomId: string;

  beforeEach(async () => {
    alice = user;
    bob = await createUser();
    for (const [difficulty, n] of [["easy", 2], ["medium", 3], ["hard", 2]] as const) {
      for (let i = 0; i < n; i++) {
        const p = await createProblem({ difficulty, slug: `${difficulty}-${i + 1}`, title: `${difficulty} ${i + 1}` });
        await createTestCases(p.id, 2);
      }
    }
    const { room } = await createRoom({ owner: alice, members: [bob] });
    roomId = room.id;
  });

  async function lobby() {
    await signIn(alice);
    const res = await rooms.create(roomId);
    expect(res.status).toBe(201);
    return ((await res.json()) as { id: string }).id;
  }

  it("create, draw and join stay allowed; start → 503 and nothing changes", async () => {
    const id = await lobby();
    expect((await rooms.draw(roomId, id, { problemCount: 2 })).status).toBe(200);
    await signIn(bob);
    expect((await rooms.join(roomId, id)).status).toBe(200);

    await signIn(alice);
    const before = await dbSnapshot();
    await expectJudgeDisabled(await rooms.start(roomId, id), JUDGE_DISABLED_SESSION_MESSAGE);
    await expectJudgeDisabled(await rooms.start(roomId, id), JUDGE_DISABLED_SESSION_MESSAGE);
    expect(await dbSnapshot()).toBe(before);
    const [row] = await getTestDb().select().from(roomSessions).where(eq(roomSessions.id, id));
    expect(row).toMatchObject({ status: "lobby", startedAt: null, endsAt: null });
  });

  it("start: foreign Origin → 403 and no session → 401 still win", async () => {
    const id = await lobby();
    expect((await rooms.start(roomId, id, { Origin: "http://evil.example" })).status).toBe(403);
    await signIn(null);
    expect((await rooms.start(roomId, id)).status).toBe(401);
  });
});

it("health reports judge: disabled with 200 (the DB decides the status)", async () => {
  const res = await healthRoute();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, db: "up", judge: "disabled" });
});
