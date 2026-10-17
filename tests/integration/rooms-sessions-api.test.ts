// Rooms R3: session lifecycle, lobby draw, state polling and submit context
// through the real route handlers and the test database (docs/specs/rooms.md
// §2, §3.4, §7.2, §7.3, §8; AC-S-SES-1..3, AC-S-SEL-4/5, AC-S-SCO-4/5,
// AC-S-SEC-1/4). `next/headers` cookies() is a per-test cookie jar; the draw
// RNG is seeded (vi.mock of src/server/rooms/rng.ts) so draws reproduce.
import { and, asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createDb, schema, type Db } from "@/server/db";
import {
  problems as problemsTable,
  roomEvents,
  roomMembers,
  roomSessionParticipants,
  roomSessionProblems,
  roomSessions,
  submissions,
} from "@/server/db/schema";

const state = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  cookies: new Map<string, string>(),
  seed: 42,
}));

vi.mock("@/server/db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/db")>();
  return { ...mod, getDb: () => state.db! };
});

vi.mock("next/headers", () => ({
  cookies: () => {
    const jar = new Map(state.cookies);
    return Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    });
  },
}));

vi.mock("@/server/rooms/rng", async () => {
  const { createSeededRng } = await import("@/lib/rooms/rng");
  return { sessionRng: () => createSeededRng(state.seed) };
});

import { POST as submitRoute } from "@/app/api/problems/[slug]/submit/route";
import { POST as runRoute } from "@/app/api/problems/[slug]/run/route";
import { POST as removeRoute } from "@/app/api/rooms/[roomId]/members/[userId]/remove/route";
import { POST as cancelRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/cancel/route";
import { POST as drawRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/draw/route";
import { POST as endRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/end/route";
import { POST as joinRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/join/route";
import { POST as leaveRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/leave/route";
import { GET as lobbyRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/lobby/route";
import { GET as searchRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/problem-search/route";
import { POST as rerollAllRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/reroll-all/route";
import { POST as pinRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/slots/[position]/pin/route";
import { POST as rerollRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/slots/[position]/reroll/route";
import { POST as startRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/start/route";
import { GET as stateRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/state/route";
import { POST as createRoute } from "@/app/api/rooms/[roomId]/sessions/route";
import type { StateResponse } from "@/lib/rooms/events";
import type { LobbyView } from "@/lib/rooms/session-view";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { signSessionToken } from "@/server/auth/token";
import { getEnv } from "@/server/env";
import { statePollLimiter } from "@/server/rooms/state";
import { insertWithLimits } from "@/server/submissions/create";

import { finalize, toFinalFields } from "../../worker/queue";
import { closeTestDb, createProblem, createTestCases, createUser, getTestDb, resetTestDb, testDbUrl } from "../helpers/db";
import { createRoom, createRoomSession, shiftSessionWindow } from "../helpers/rooms";

const ORIGIN = new URL(getEnv().AUTH_URL).origin;
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const MIN = 60_000;

type User = Awaited<ReturnType<typeof createUser>>;
type Problem = Awaited<ReturnType<typeof createProblem>>;

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
const get = (path: string) => new Request(`${ORIGIN}${path}`);
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const base = (r: string, s: string) => `/api/rooms/${r}/sessions/${s}`;

async function signIn(user: User | null) {
  state.cookies.clear();
  if (user) state.cookies.set(SESSION_COOKIE, await signSessionToken(user.id));
}
async function as<T>(user: User | null, fn: () => Promise<T>): Promise<T> {
  await signIn(user);
  return fn();
}

type H = Record<string, string>;
const api = {
  create: (r: string, body: unknown = {}, h?: H) => createRoute(post(`/api/rooms/${r}/sessions`, body, h), params({ roomId: r })),
  draw: (r: string, s: string, body: unknown = {}, h?: H) => drawRoute(post(`${base(r, s)}/draw`, body, h), params({ roomId: r, sessionId: s })),
  reroll: (r: string, s: string, position: string, body: unknown = {}, h?: H) =>
    rerollRoute(post(`${base(r, s)}/slots/${position}/reroll`, body, h), params({ roomId: r, sessionId: s, position })),
  rerollAll: (r: string, s: string, body: unknown = {}, h?: H) =>
    rerollAllRoute(post(`${base(r, s)}/reroll-all`, body, h), params({ roomId: r, sessionId: s })),
  pin: (r: string, s: string, position: string, body: unknown, h?: H) =>
    pinRoute(post(`${base(r, s)}/slots/${position}/pin`, body, h), params({ roomId: r, sessionId: s, position })),
  join: (r: string, s: string, body: unknown = {}, h?: H) => joinRoute(post(`${base(r, s)}/join`, body, h), params({ roomId: r, sessionId: s })),
  leave: (r: string, s: string, body: unknown = {}, h?: H) => leaveRoute(post(`${base(r, s)}/leave`, body, h), params({ roomId: r, sessionId: s })),
  start: (r: string, s: string, body: unknown = {}, h?: H) => startRoute(post(`${base(r, s)}/start`, body, h), params({ roomId: r, sessionId: s })),
  end: (r: string, s: string, body: unknown = {}, h?: H) => endRoute(post(`${base(r, s)}/end`, body, h), params({ roomId: r, sessionId: s })),
  cancel: (r: string, s: string, body: unknown = {}, h?: H) => cancelRoute(post(`${base(r, s)}/cancel`, body, h), params({ roomId: r, sessionId: s })),
  state: (r: string, s: string, query = "") => stateRoute(get(`${base(r, s)}/state${query}`), params({ roomId: r, sessionId: s })),
  lobby: (r: string, s: string) => lobbyRoute(get(`${base(r, s)}/lobby`), params({ roomId: r, sessionId: s })),
  search: (r: string, s: string, q: string) =>
    searchRoute(get(`${base(r, s)}/problem-search?q=${encodeURIComponent(q)}`), params({ roomId: r, sessionId: s })),
  submit: (slug: string, body: unknown, h?: H) =>
    submitRoute(post(`/api/problems/${slug}/submit`, body, h), params({ slug })),
  run: (slug: string, body: unknown) => runRoute(post(`/api/problems/${slug}/run`, body), params({ slug })),
  remove: (r: string, u: string) => removeRoute(post(`/api/rooms/${r}/members/${u}/remove`, {}), params({ roomId: r, userId: u })),
};

async function body<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/** Everything a session route could write, for "rejected requests write nothing". */
async function dbSnapshot() {
  const { rows } = await getTestDb().execute(sql`
    SELECT
      (SELECT coalesce(json_agg(s ORDER BY s.id), '[]') FROM room_sessions s) AS sessions,
      (SELECT coalesce(json_agg(p ORDER BY p.session_id, p.position), '[]') FROM room_session_problems p) AS problems,
      (SELECT coalesce(json_agg(p ORDER BY p.session_id, p.user_id), '[]') FROM room_session_participants p) AS participants,
      (SELECT coalesce(json_agg(e ORDER BY e.id), '[]') FROM room_events e) AS events,
      (SELECT count(*) FROM submissions) AS submissions
  `);
  return JSON.stringify(rows[0]);
}

async function eventTypes(sessionId: string) {
  const rows = await getTestDb()
    .select({ type: roomEvents.type })
    .from(roomEvents)
    .where(eq(roomEvents.sessionId, sessionId))
    .orderBy(asc(roomEvents.id));
  return rows.map((r) => r.type);
}

async function sessionRow(id: string) {
  const [row] = await getTestDb().select().from(roomSessions).where(eq(roomSessions.id, id));
  return row;
}

let alice: User; // owner
let bob: User; // member (host of some sessions)
let carol: User; // member
let mallory: User; // not a member
let catalog: { easy: Problem[]; medium: Problem[]; hard: Problem[] };
let roomId: string;

/** 4 easy (array), 4 medium (3 dynamic-programming, 1 array), 2 hard (string). */
async function seedCatalog() {
  const make = async (difficulty: "easy" | "medium" | "hard", n: number, tags: (i: number) => string[]) => {
    const list: Problem[] = [];
    for (let i = 0; i < n; i++) {
      const p = await createProblem({ difficulty, title: `${difficulty} ${i + 1}`, slug: `${difficulty}-${i + 1}`, tags: tags(i) });
      await createTestCases(p.id, 2);
      list.push(p);
    }
    return list;
  };
  return {
    easy: await make("easy", 4, () => ["array"]),
    medium: await make("medium", 4, (i) => (i === 0 ? ["array"] : ["dynamic-programming"])),
    hard: await make("hard", 2, () => ["string"]),
  };
}

beforeAll(() => {
  state.db = getTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  statePollLimiter.reset();
  state.seed = 42;
  alice = await createUser({ username: "alice" });
  bob = await createUser({ username: "bob" });
  carol = await createUser({ username: "carol" });
  mallory = await createUser({ username: "mallory" });
  catalog = await seedCatalog();
  const { room } = await createRoom({ owner: alice, members: [bob, carol], name: "Saturday Algo Club" });
  roomId = room.id;
});
afterAll(closeTestDb);

async function createLobby(host: User = alice, settings: unknown = {}) {
  const res = await as(host, () => api.create(roomId, settings));
  expect(res.status).toBe(201);
  return body<{ id: string; lobby: LobbyView }>(res);
}

async function liveSession(host: User = alice, settings: unknown = { problemCount: 2, durationMin: 30 }) {
  const { id } = await createLobby(host, settings);
  expect((await as(host, () => api.start(roomId, id))).status).toBe(200);
  return id;
}

// --- Lifecycle (AC-S-SES-1) -------------------------------------------------

describe("session lifecycle (AC-S-SES-1)", () => {
  it("create → lobby with the host joined and the default draw (4 problems, 90 min, suggested 1/2/1)", async () => {
    const { id, lobby } = await createLobby();
    expect(lobby).toMatchObject({
      sessionId: id,
      status: "lobby",
      hostId: alice.id,
      canManage: true,
      problemCount: 4,
      durationMin: 90,
      rerollCount: 0,
      rerollsLeft: 30,
      actualMix: { easy: 1, medium: 2, hard: 1 },
      settings: { tags: [], mixMode: "suggested", mix: { easy: 1, medium: 2, hard: 1 }, challenge: "balanced", avoidSolved: true },
      calibration: { sessions: 0, suggested: { easy: 1, medium: 2, hard: 1 }, target: 0.5 },
      pool: { available: { easy: 4, medium: 4, hard: 2 }, unused: { easy: 4, medium: 4, hard: 2 } },
    });
    expect(lobby.slots.map((s) => s.difficulty)).toEqual(["easy", "medium", "medium", "hard"]);
    expect(lobby.slots.every((s) => s.problem && s.note?.tier === "A")).toBe(true);
    expect(await eventTypes(id)).toEqual(["participant_joined", "lobby_updated"]);
    const parts = await getTestDb().select().from(roomSessionParticipants).where(eq(roomSessionParticipants.sessionId, id));
    expect(parts.map((p) => p.userId)).toEqual([alice.id]);
  });

  it("join (idempotent) → start by the host → live with endsAt = startedAt + duration and session_started", async () => {
    const { id } = await createLobby(alice, { durationMin: 45 });
    expect((await as(bob, () => api.join(roomId, id))).status).toBe(200);
    expect((await as(bob, () => api.join(roomId, id))).status).toBe(200);
    expect((await as(bob, () => api.start(roomId, id))).status).toBe(403);
    const res = await as(alice, () => api.start(roomId, id));
    expect(res.status).toBe(200);
    const { startedAt, endsAt } = await body<{ startedAt: string; endsAt: string }>(res);
    expect(new Date(endsAt).getTime() - new Date(startedAt).getTime()).toBe(45 * MIN);
    const row = await sessionRow(id);
    expect(row).toMatchObject({ status: "live" });
    expect(row.startedAt!.toISOString()).toBe(startedAt);
    expect(await eventTypes(id)).toEqual(["participant_joined", "lobby_updated", "participant_joined", "session_started"]);
    // Ranks exist from the start (everyone 0 → rank 1).
    const parts = await getTestDb().select().from(roomSessionParticipants).where(eq(roomSessionParticipants.sessionId, id));
    expect(parts.map((p) => p.rank)).toEqual([1, 1]);
    // Starting again, cancelling live, a second open session: 409.
    expect((await as(alice, () => api.start(roomId, id))).status).toBe(409);
    const cancel = await as(alice, () => api.cancel(roomId, id));
    expect(cancel.status).toBe(409);
    expect(await body(cancel)).toMatchObject({ code: "end_instead", error: "End the session instead" });
    const second = await as(bob, () => api.create(roomId));
    expect(second.status).toBe(409);
    expect(await body(second)).toMatchObject({ code: "session_open", sessionId: id });
  });

  it("lazy finish after ends_at on the next state poll: ended_at = ends_at, session_ended once even with 5 parallel polls", async () => {
    const id = await liveSession();
    await shiftSessionWindow(id, new Date(Date.now() - 31 * MIN));
    await signIn(bob);
    const responses = await Promise.all(Array.from({ length: 5 }, () => api.state(roomId, id)));
    for (const r of responses) {
      expect(r.status).toBe(200);
      expect((await body<StateResponse>(r)).status).toBe("finished");
    }
    const row = await sessionRow(id);
    expect(row).toMatchObject({ status: "finished", endReason: "time" });
    expect(row.endedAt!.getTime()).toBe(row.endsAt!.getTime());
    expect((await eventTypes(id)).filter((t) => t === "session_ended")).toHaveLength(1);
    // End on a finished session is idempotent; join is refused.
    const end = await as(alice, () => api.end(roomId, id));
    expect(end.status).toBe(200);
    expect(await body(end)).toMatchObject({ endReason: "time" });
    expect((await as(carol, () => api.join(roomId, id))).status).toBe(409);
    // A new session can be created now.
    expect((await as(bob, () => api.create(roomId))).status).toBe(201);
  });

  it("end early by the room owner (not the host) and cancel of a lobby by the host", async () => {
    const id = await liveSession(bob);
    const res = await as(alice, () => api.end(roomId, id));
    expect(res.status).toBe(200);
    expect(await body(res)).toMatchObject({ endReason: "host" });
    expect(await sessionRow(id)).toMatchObject({ status: "finished", endReason: "host" });
    expect((await eventTypes(id)).at(-1)).toBe("session_ended");
    expect((await as(carol, () => api.end(roomId, id))).status).toBe(403);

    const { id: lobbyId } = await createLobby(carol);
    expect((await as(bob, () => api.cancel(roomId, lobbyId))).status).toBe(403);
    expect((await as(carol, () => api.end(roomId, lobbyId))).status).toBe(409);
    expect((await as(carol, () => api.cancel(roomId, lobbyId))).status).toBe(200);
    expect(await sessionRow(lobbyId)).toMatchObject({ status: "cancelled", endReason: "cancelled" });
    expect((await eventTypes(lobbyId)).at(-1)).toBe("session_cancelled");
    expect((await as(carol, () => api.cancel(roomId, lobbyId))).status).toBe(409);
  });

  it("a stale lobby (7 days) is cancelled on the next create, which then succeeds", async () => {
    const stale = await createRoomSession({ roomId, hostId: bob.id, createdAt: new Date(Date.now() - 8 * 24 * 60 * MIN) });
    expect((await as(alice, () => api.create(roomId))).status).toBe(201);
    expect(await sessionRow(stale.id)).toMatchObject({ status: "cancelled", endReason: "stale" });
    expect(await eventTypes(stale.id)).toEqual(["session_cancelled"]);
  });

  it("start needs every slot filled and published, and a participant", async () => {
    const { id, lobby } = await createLobby(alice, { problemCount: 2, tags: ["string"], mixMode: "manual", mix: { easy: 0, medium: 0, hard: 2 } });
    expect(lobby.drawError).toBeUndefined();
    await getTestDb().update(problemsTable).set({ published: false }).where(eq(problemsTable.id, catalog.hard[1].id));
    const position = lobby.slots.find((s) => s.problem?.slug === "hard-2")!.position;
    const res = await as(alice, () => api.start(roomId, id));
    expect(res.status).toBe(409);
    expect(await body(res)).toMatchObject({ code: "slot_unavailable", position, error: `Problem ${position} is no longer available; re-roll it` });

    await getTestDb().update(problemsTable).set({ published: true });
    await getTestDb().delete(roomSessionParticipants).where(eq(roomSessionParticipants.sessionId, id));
    expect(await body(await as(alice, () => api.start(roomId, id)))).toMatchObject({ code: "no_participants" });
    await getTestDb().delete(roomSessionProblems).where(and(eq(roomSessionProblems.sessionId, id), eq(roomSessionProblems.position, 2)));
    expect(await body(await as(alice, () => api.start(roomId, id)))).toMatchObject({ code: "slots_incomplete" });
    expect(await sessionRow(id)).toMatchObject({ status: "lobby" });
  });

  it("leave the lobby (not the host); a live session cannot be left", async () => {
    const { id } = await createLobby();
    await as(bob, () => api.join(roomId, id));
    expect((await as(bob, () => api.leave(roomId, id))).status).toBe(200);
    expect((await as(bob, () => api.leave(roomId, id))).status).toBe(200);
    expect(await body(await as(alice, () => api.leave(roomId, id)))).toMatchObject({ code: "host_stays" });
    await as(bob, () => api.join(roomId, id));
    await as(alice, () => api.start(roomId, id));
    expect((await as(bob, () => api.leave(roomId, id))).status).toBe(409);
  });

  it("joining a live session adds the participant with a rank", async () => {
    const id = await liveSession();
    expect((await as(carol, () => api.join(roomId, id))).status).toBe(200);
    const [p] = await getTestDb()
      .select()
      .from(roomSessionParticipants)
      .where(and(eq(roomSessionParticipants.sessionId, id), eq(roomSessionParticipants.userId, carol.id)));
    expect(p.rank).toBe(1);
    expect((await eventTypes(id)).at(-1)).toBe("participant_joined");
  });
});

// --- Draw, re-roll, pin (AC-S-SEL-4, AC-S-SEL-5) ---------------------------

describe("lobby draw", () => {
  it("is reproducible for a seed and follows the tiers (used in the room → tier C)", async () => {
    const first = await createLobby();
    const ids = first.lobby.slots.map((s) => s.problem!.slug);
    expect((await as(alice, () => api.cancel(roomId, first.id))).status).toBe(200);
    const again = await createLobby();
    expect(again.lobby.slots.map((s) => s.problem!.slug)).toEqual(ids);
    expect((await as(alice, () => api.cancel(roomId, again.id))).status).toBe(200);

    // Everything easy except one was used in a finished session: the unused one is drawn.
    const used = catalog.easy.slice(0, 3);
    await createRoomSession({
      roomId,
      status: "finished",
      problems: used.map((p) => ({ problemId: p.id, difficulty: "easy" as const })),
    });
    const third = await createLobby(alice, { problemCount: 1, mixMode: "manual", mix: { easy: 1, medium: 0, hard: 0 } });
    expect(third.lobby.slots[0]).toMatchObject({ problem: { slug: "easy-4" }, note: { tier: "A" } });
    expect(third.lobby.pool).toMatchObject({ unused: { easy: 1 } });
    // A solved problem (by an expected participant) is tier B.
    await getTestDb().insert(submissions).values({
      userId: bob.id, problemId: catalog.easy[3].id, kind: "submit", language: "python", code: "x",
      status: "accepted", startedAt: new Date(), finishedAt: new Date(),
    });
    const res = await as(alice, () => api.draw(roomId, third.id, { avoidSolved: true }));
    const lobby = (await body<{ lobby: LobbyView }>(res)).lobby;
    expect(lobby.slots[0].note).toMatchObject({ tier: "B", solvedBy: 1, expectedCount: 3 });
  });

  it("pool_too_small and mix_infeasible → 409 with counts; nothing written", async () => {
    const { id } = await createLobby();
    const before = await dbSnapshot();
    const small = await as(alice, () => api.draw(roomId, id, { tags: ["string"], problemCount: 3 }));
    expect(small.status).toBe(409);
    expect(await body(small)).toMatchObject({
      code: "pool_too_small",
      counts: { easy: 0, medium: 0, hard: 2 },
      error: "Only 2 problems match these topics. Choose fewer problems, add topics, or pick Any topic.",
    });
    const infeasible = await as(alice, () => api.draw(roomId, id, { mix: { easy: 0, medium: 1, hard: 3 } }));
    expect(infeasible.status).toBe(409);
    expect(await body(infeasible)).toMatchObject({
      code: "mix_infeasible",
      counts: { easy: 4, medium: 4, hard: 2 },
      requested: { easy: 0, medium: 1, hard: 3 },
    });
    expect(await dbSnapshot()).toBe(before);
  });

  it("create with an impossible draw → 201 with lobby.drawError and empty slots", async () => {
    const res = await as(alice, () => api.create(roomId, { problemCount: 5, tags: ["string"] }));
    expect(res.status).toBe(201);
    const { lobby } = await body<{ lobby: LobbyView }>(res);
    expect(lobby.slots).toEqual([]);
    expect(lobby.drawError).toMatchObject({ code: "pool_too_small", counts: { hard: 2 } });
  });

  it("request errors: bad mix sum / unknown topic / out of range → 400; non-host member → 403", async () => {
    const { id } = await createLobby();
    const before = await dbSnapshot();
    expect((await as(alice, () => api.draw(roomId, id, { mixMode: "manual", mix: { easy: 1, medium: 1, hard: 1 } }))).status).toBe(400);
    const unknown = await as(alice, () => api.draw(roomId, id, { tags: ["graph"] }));
    expect(unknown.status).toBe(400);
    expect((await body(unknown)).fieldErrors).toMatchObject({ tags: "Unknown topic: graph" });
    expect((await as(alice, () => api.draw(roomId, id, { problemCount: 9 }))).status).toBe(400);
    expect((await as(alice, () => api.draw(roomId, id, { durationMin: 17 }))).status).toBe(400);
    expect((await as(bob, () => api.draw(roomId, id, {}))).status).toBe(403);
    expect(await dbSnapshot()).toBe(before);
  });

  it("draw keeps pinned slots; lowering N below the pins → 400 'Unpin a problem first'", async () => {
    const { id } = await createLobby(alice, { problemCount: 2, mixMode: "manual", mix: { easy: 1, medium: 1, hard: 0 } });
    expect((await as(alice, () => api.pin(roomId, id, "1", { slug: "hard-1" }))).status).toBe(200);
    expect((await as(alice, () => api.pin(roomId, id, "2", { slug: "hard-2" }))).status).toBe(200);
    const res = await as(alice, () => api.draw(roomId, id, { problemCount: 1, mixMode: "suggested" }));
    expect(res.status).toBe(400);
    expect((await body(res)).error).toBe("Unpin a problem first");
    const redraw = await as(alice, () => api.draw(roomId, id, { problemCount: 3, mixMode: "suggested" }));
    expect(redraw.status).toBe(200);
    const { lobby } = await body<{ lobby: LobbyView }>(redraw);
    expect(lobby.slots.filter((s) => s.pinned).map((s) => [s.position, s.problem!.slug])).toEqual([
      [1, "hard-1"],
      [2, "hard-2"],
    ]);
    expect(lobby.slots).toHaveLength(3);
    expect(lobby.actualMix.hard).toBe(2);
  });

  it("changing only duration / planned time does not re-draw", async () => {
    const { id, lobby } = await createLobby();
    const res = await as(alice, () => api.draw(roomId, id, { durationMin: 60, plannedFor: "2026-12-01T18:00:00Z" }));
    const next = (await body<{ lobby: LobbyView }>(res)).lobby;
    expect(next.slots.map((s) => s.problem!.slug)).toEqual(lobby.slots.map((s) => s.problem!.slug));
    expect(next).toMatchObject({ durationMin: 60, plannedFor: "2026-12-01T18:00:00.000Z" });
  });

  it("re-roll: same difficulty, counts towards 30; the 31st is 409; pinned slots refuse; exhausted → notice", async () => {
    const { id, lobby } = await createLobby(alice, { problemCount: 1, mixMode: "manual", mix: { easy: 0, medium: 0, hard: 1 } });
    const firstSlug = lobby.slots[0].problem!.slug;
    const r1 = await body<{ lobby: LobbyView }>(await as(alice, () => api.reroll(roomId, id, "1")));
    expect(r1.lobby.slots[0].difficulty).toBe("hard");
    expect(r1.lobby.slots[0].problem!.slug).not.toBe(firstSlug);
    expect(r1.lobby).toMatchObject({ rerollCount: 1, notices: [] });
    // Only two hard problems: the next re-roll shows an earlier one again, with the notice.
    const r2 = await body<{ lobby: LobbyView }>(await as(alice, () => api.reroll(roomId, id, "1")));
    expect(r2.lobby.slots[0].problem!.slug).toBe(firstSlug);
    expect(r2.lobby.notices).toEqual([
      { code: "rerolls_reset", difficulty: "hard", message: "No other unused options; showing earlier ones again (Hard)" },
    ]);
    expect((await as(bob, () => api.reroll(roomId, id, "1"))).status).toBe(403);
    expect((await as(alice, () => api.reroll(roomId, id, "2"))).status).toBe(404);
    expect((await as(alice, () => api.reroll(roomId, id, "x"))).status).toBe(404);

    await getTestDb().update(roomSessions).set({ rerollCount: 30 }).where(eq(roomSessions.id, id));
    const capped = await as(alice, () => api.reroll(roomId, id, "1"));
    expect(capped.status).toBe(409);
    expect(await body(capped)).toMatchObject({ code: "reroll_limit", error: "Re-roll limit reached for this session" });
    expect((await as(alice, () => api.rerollAll(roomId, id))).status).toBe(409);

    await getTestDb().update(roomSessions).set({ rerollCount: 0 }).where(eq(roomSessions.id, id));
    await as(alice, () => api.pin(roomId, id, "1", { slug: "hard-1" }));
    expect(await body(await as(alice, () => api.reroll(roomId, id, "1")))).toMatchObject({ code: "slot_pinned" });
  });

  it("re-roll all keeps pinned slots and counts as one re-roll", async () => {
    const { id } = await createLobby();
    await as(alice, () => api.pin(roomId, id, "2", { slug: "medium-4" }));
    const before = (await body<{ lobby: LobbyView }>(await as(alice, () => api.lobby(roomId, id)))).lobby;
    state.seed = 7;
    const res = await as(alice, () => api.rerollAll(roomId, id));
    expect(res.status).toBe(200);
    const { lobby } = await body<{ lobby: LobbyView }>(res);
    expect(lobby.rerollCount).toBe(1);
    expect(lobby.slots[1]).toMatchObject({ pinned: true, problem: { slug: "medium-4" } });
    for (const [i, s] of lobby.slots.entries()) {
      if (!s.pinned) {
        expect(s.problem!.slug).not.toBe(before.slots[i].problem!.slug);
        expect(s.difficulty).toBe(before.slots[i].difficulty);
      }
    }
  });

  it("pin: duplicate → 409, unknown or unpublished → 404; the slot takes the problem's difficulty; unpin", async () => {
    const { id, lobby } = await createLobby();
    const taken = lobby.slots[0].problem!.slug;
    const dup = await as(alice, () => api.pin(roomId, id, "4", { slug: taken }));
    expect(dup.status).toBe(409);
    expect(await body(dup)).toMatchObject({ code: "duplicate_problem", error: "This problem is already in the session" });
    expect((await as(alice, () => api.pin(roomId, id, "4", { slug: "nope" }))).status).toBe(404);
    await getTestDb().update(problemsTable).set({ published: false }).where(eq(problemsTable.slug, "easy-4"));
    expect((await as(alice, () => api.pin(roomId, id, "4", { slug: "easy-4" }))).status).toBe(404);
    const unusedEasy = ["easy-1", "easy-2", "easy-3"].find((s) => s !== taken)!;
    const res = await as(alice, () => api.pin(roomId, id, "4", { slug: unusedEasy }));
    expect(res.status).toBe(200);
    const pinned = (await body<{ lobby: LobbyView }>(res)).lobby;
    expect(pinned.slots[3]).toMatchObject({ position: 4, difficulty: "easy", pinned: true, problem: { slug: unusedEasy } });
    expect(pinned.actualMix).toEqual({ easy: 2, medium: 2, hard: 0 });
    expect(pinned.settings.mix).toEqual({ easy: 2, medium: 2, hard: 0 });
    const unpinned = await as(alice, () => api.pin(roomId, id, "4", { unpin: true }));
    expect((await body<{ lobby: LobbyView }>(unpinned)).lobby.slots[3]).toMatchObject({ pinned: false, problem: { slug: unusedEasy } });
    expect((await as(alice, () => api.pin(roomId, id, "4", { slug: "x", unpin: true }))).status).toBe(400);
    expect((await as(bob, () => api.pin(roomId, id, "4", { unpin: true }))).status).toBe(403);
  });

  it("lobby view and problem search: titles and search for the host/owner only", async () => {
    const { id } = await createLobby(bob);
    const memberView = await body<{ lobby: LobbyView }>(await as(carol, () => api.lobby(roomId, id)));
    expect(memberView.lobby.canManage).toBe(false);
    const text = JSON.stringify(memberView);
    for (const p of [...catalog.easy, ...catalog.medium, ...catalog.hard]) {
      expect(text).not.toContain(p.slug);
      expect(text).not.toContain(p.title);
    }
    expect(memberView.lobby.calibration).toBeUndefined();
    expect(memberView.lobby.slots[0]).toEqual({ position: 1, difficulty: "easy", pinned: false, tags: ["array"] });
    // The owner manages any session.
    expect((await body<{ lobby: LobbyView }>(await as(alice, () => api.lobby(roomId, id)))).lobby.slots[0].problem).toBeTruthy();

    const found = await as(bob, () => api.search(roomId, id, "medium"));
    expect(found.status).toBe(200);
    expect(await body(found)).toEqual([
      { slug: "medium-1", title: "medium 1", difficulty: "medium", tags: ["array"] },
      { slug: "medium-2", title: "medium 2", difficulty: "medium", tags: ["dynamic-programming"] },
      { slug: "medium-3", title: "medium 3", difficulty: "medium", tags: ["dynamic-programming"] },
      { slug: "medium-4", title: "medium 4", difficulty: "medium", tags: ["dynamic-programming"] },
    ]);
    expect(await body(await as(bob, () => api.search(roomId, id, "%")))).toEqual([]);
    expect((await as(bob, () => api.search(roomId, id, ""))).status).toBe(400);
    expect((await as(bob, () => api.search(roomId, id, "x".repeat(61)))).status).toBe(400);
    expect((await as(carol, () => api.search(roomId, id, "medium"))).status).toBe(403);
  });
});

// --- State endpoint (AC-S-SES-2) -------------------------------------------

describe("state endpoint (AC-S-SES-2)", () => {
  it("no cursor → snapshot + latest cursor; after=<cursor> → only newer events; no-store", async () => {
    const { id } = await createLobby();
    const res = await as(bob, () => api.state(roomId, id));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const first = await body<StateResponse & { viewer: unknown }>(res);
    expect(first).toMatchObject({ status: "lobby", events: [], hasMore: false, pendingJudging: 0, endsAt: null });
    expect(first.viewer).toEqual({ isParticipant: false, canManage: false });
    expect(first.snapshot).toBeDefined();
    const [{ maxId }] = await getTestDb().select({ maxId: sql<string>`max(id)::text` }).from(roomEvents);
    expect(first.cursor).toBe(maxId);
    expect(Math.abs(new Date(first.serverNow).getTime() - Date.now())).toBeLessThan(10_000);

    // Nothing new: no events, no snapshot.
    const idle = await body<StateResponse>(await as(bob, () => api.state(roomId, id, `?after=${first.cursor}`)));
    expect(idle).toMatchObject({ cursor: first.cursor, events: [] });
    expect(idle.snapshot).toBeUndefined();
    // The every-10th-poll self-heal flag.
    expect((await body<StateResponse>(await as(bob, () => api.state(roomId, id, `?after=${first.cursor}&snapshot=1`)))).snapshot).toBeDefined();

    await as(bob, () => api.join(roomId, id));
    const next = await body<StateResponse>(await as(carol, () => api.state(roomId, id, `?after=${first.cursor}`)));
    expect(next.events.map((e) => e.type)).toEqual(["participant_joined"]);
    expect(next.events[0]).toMatchObject({ actor: { userId: bob.id, username: "bob" } });
    expect(BigInt(next.cursor)).toBeGreaterThan(BigInt(first.cursor));
    expect(next.snapshot!.participants.map((p) => p.username)).toEqual(["alice", "bob"]);
  });

  it.each(["abc", "-1", "01", "99999999999999999999", "123456"])("cursor %s (invalid or ahead) → fresh snapshot, no events", async (after) => {
    const { id } = await createLobby();
    const res = await body<StateResponse>(await as(alice, () => api.state(roomId, id, `?after=${after}`)));
    expect(res.events).toEqual([]);
    expect(res.snapshot).toBeDefined();
    expect(res.cursor).not.toBe(after);
  });

  it("150 events → a page of 100 with hasMore, then the remaining 50", async () => {
    const { id } = await createLobby();
    const start = (await body<StateResponse>(await as(alice, () => api.state(roomId, id)))).cursor;
    await getTestDb().insert(roomEvents).values(
      Array.from({ length: 150 }, () => ({ sessionId: id, type: "lobby_updated" as const, payload: { problemCount: 4, durationMin: 90 } })),
    );
    const page1 = await body<StateResponse>(await as(alice, () => api.state(roomId, id, `?after=${start}`)));
    expect(page1.events).toHaveLength(100);
    expect(page1.hasMore).toBe(true);
    const page2 = await body<StateResponse>(await as(alice, () => api.state(roomId, id, `?after=${page1.cursor}`)));
    expect(page2.events).toHaveLength(50);
    expect(page2.hasMore).toBe(false);
    const ids = [...page1.events, ...page2.events].map((e) => BigInt(e.id));
    expect(ids.every((v, i) => i === 0 || v > ids[i - 1])).toBe(true);
    expect(new Set(ids).size).toBe(150);
  });

  it("lobby snapshot for a non-host has no titles or slugs; live reveals them", async () => {
    const { id } = await createLobby();
    const lobbyState = await as(carol, () => api.state(roomId, id));
    const text = await lobbyState.text();
    for (const p of [...catalog.easy, ...catalog.medium, ...catalog.hard]) expect(text).not.toContain(`"${p.slug}"`);
    const snap = (JSON.parse(text) as StateResponse).snapshot!;
    expect(snap.problems[0]).toEqual({ position: 1, difficulty: "easy", tags: ["array"] });
    const hostSnap = (await body<StateResponse>(await as(alice, () => api.state(roomId, id)))).snapshot!;
    expect(hostSnap.problems[0].slug).toBeTruthy();
    await as(alice, () => api.start(roomId, id));
    const live = (await body<StateResponse>(await as(carol, () => api.state(roomId, id)))).snapshot!;
    expect(live.problems.every((p) => p.slug && p.title)).toBe(true);
  });

  it("the 121st poll in a minute → 429 with Retry-After: 5", async () => {
    const { id } = await createLobby();
    await signIn(bob);
    for (let i = 0; i < 120; i++) expect((await api.state(roomId, id, "?after=0")).status).toBe(200);
    const limited = await api.state(roomId, id, "?after=0");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("5");
    // Per user: another member is not affected.
    expect((await as(carol, () => api.state(roomId, id))).status).toBe(200);
  });

  it("query count (AC-S-HIS-2 part): a poll without new events uses 2 queries (≤ 3); with events 5 (3 + 2)", async () => {
    const { id } = await createLobby();
    const { pool } = createDb(testDbUrl());
    let queries = 0;
    const counting = drizzle(pool, { schema, logger: { logQuery: () => void queries++ } }) as unknown as Db;
    const previous = state.db;
    try {
      const first = await body<StateResponse>(await as(bob, () => api.state(roomId, id)));
      state.db = counting;
      queries = 0;
      expect((await as(bob, () => api.state(roomId, id, `?after=${first.cursor}`))).status).toBe(200);
      // The user, then membership + session + clock + latest id + pending in one statement.
      expect(queries).toBe(2);
      state.db = previous;
      await as(carol, () => api.join(roomId, id));
      state.db = counting;
      queries = 0;
      const withEvents = await body<StateResponse>(await as(bob, () => api.state(roomId, id, `?after=${first.cursor}`)));
      expect(withEvents.events).toHaveLength(1);
      // + events (Q6) + snapshot (problems; participants with cells) = the spec's "+2".
      expect(queries).toBe(5);
    } finally {
      state.db = previous;
      await pool.end();
    }
  });

  it("a removed member's next poll → 404 with the unknown-session body", async () => {
    const id = await liveSession();
    await as(bob, () => api.join(roomId, id));
    expect((await as(bob, () => api.state(roomId, id))).status).toBe(200);
    expect((await as(alice, () => api.remove(roomId, bob.id))).status).toBe(200);
    const gone = await as(bob, () => api.state(roomId, id));
    expect(gone.status).toBe(404);
    expect(await gone.json()).toEqual({ error: "Session not found" });
  });

  it("solved ticks reach the snapshot; other participants' cells carry no verdicts or code", async () => {
    const id = await liveSession(alice, { problemCount: 1, mixMode: "manual", mix: { easy: 1, medium: 0, hard: 0 } });
    await as(bob, () => api.join(roomId, id));
    const slug = (await body<{ lobby: LobbyView }>(await as(alice, () => api.lobby(roomId, id)))).lobby.slots[0].problem!.slug;
    const cursor = (await body<StateResponse>(await as(alice, () => api.state(roomId, id)))).cursor;
    const sub = await body<{ id: string }>(await as(bob, () => api.submit(slug, { language: "python", code: "SECRET_CODE", roomSessionId: id })));
    await getTestDb().update(submissions).set({ status: "running", startedAt: new Date() }).where(eq(submissions.id, sub.id));
    await finalize(getTestDb(), sub.id, toFinalFields("submit", { status: "accepted", passedCount: 2, totalCount: 2, runtimeMs: 1, memoryKb: 1, failedTestIndex: null, failedCase: null, caseResults: [], stdout: "SECRET_OUT", error: null }));
    const res = await as(alice, () => api.state(roomId, id, `?after=${cursor}`));
    const text = await res.text();
    expect(text).not.toMatch(/SECRET_CODE|SECRET_OUT|accepted|wrong_answer/);
    const parsed = JSON.parse(text) as StateResponse;
    expect(parsed.events.map((e) => e.type)).toEqual(["problem_solved"]);
    const bobRow = parsed.snapshot!.participants.find((p) => p.username === "bob")!;
    expect(bobRow).toMatchObject({ solvedCount: 1, rank: 1 });
    expect(bobRow.cells).toEqual([expect.objectContaining({ position: 1, attempts: 1, wrongBefore: 0, firstSolver: true })]);
  });
});

// --- Cursor replay under concurrent writes (AC-S-SCO-5 through HTTP) --------

describe("cursor replay under concurrent finalizes", () => {
  it("polling the state endpoint while 12 finalizes commit in parallel: no event skipped or duplicated", async () => {
    const id = await liveSession(alice, { problemCount: 2, mixMode: "manual", mix: { easy: 1, medium: 1, hard: 0 } });
    await as(bob, () => api.join(roomId, id));
    await as(carol, () => api.join(roomId, id));
    const slots = await getTestDb().select().from(roomSessionProblems).where(eq(roomSessionProblems.sessionId, id));
    const session = await sessionRow(id);
    const rows: { id: string; status: "accepted" | "wrong_answer" }[] = [];
    for (const [ui, u] of [alice, bob, carol].entries()) {
      for (const slot of slots) {
        for (let k = 0; k < 2; k++) {
          const createdAt = new Date(session.startedAt!.getTime() + 1000 * (1 + ui * 10 + slot.position * 3 + k));
          const [r] = await getTestDb().insert(submissions).values({
            userId: u.id, problemId: slot.problemId, roomSessionId: id, kind: "submit", language: "python",
            code: "x", status: "running", createdAt, startedAt: createdAt,
          }).returning({ id: submissions.id });
          rows.push({ id: r.id, status: k === 0 ? "wrong_answer" : "accepted" });
        }
      }
    }
    let cursor = (await body<StateResponse>(await as(carol, () => api.state(roomId, id)))).cursor;
    const seen: string[] = [];
    let done = false;
    await signIn(carol);
    const poller = (async () => {
      while (!done) {
        const r = await body<StateResponse>(await api.state(roomId, id, `?after=${cursor}`));
        seen.push(...r.events.map((e) => e.id));
        cursor = r.cursor;
        await new Promise((res) => setTimeout(res, 2));
      }
    })();
    const fields = (status: "accepted" | "wrong_answer") =>
      toFinalFields("submit", { status, passedCount: 0, totalCount: 2, runtimeMs: 1, memoryKb: 1, failedTestIndex: status === "accepted" ? null : 0, failedCase: null, caseResults: [], stdout: "", error: null });
    await Promise.all(rows.sort(() => Math.random() - 0.5).map((r) => finalize(getTestDb(), r.id, fields(r.status))));
    done = true;
    await poller;
    for (;;) {
      const r = await body<StateResponse>(await api.state(roomId, id, `?after=${cursor}`));
      seen.push(...r.events.map((e) => e.id));
      cursor = r.cursor;
      if (!r.hasMore) break;
    }
    const all = await getTestDb()
      .select({ id: roomEvents.id, type: roomEvents.type })
      .from(roomEvents)
      .where(and(eq(roomEvents.sessionId, id), sql`${roomEvents.type} IN ('problem_solved', 'attempt_failed')`))
      .orderBy(asc(roomEvents.id));
    expect(seen).toEqual(all.map((e) => e.id.toString()));
    expect(all.filter((e) => e.type === "problem_solved")).toHaveLength(6);
  });
});

// --- Submit with session context (AC-S-SES-3, AC-S-SCO-4, §8.3) -------------

describe("submit with roomSessionId (AC-S-SES-3)", () => {
  const CODE = "class Solution:\n    def solve(self, x):\n        return x\n";

  async function liveWithSlugs() {
    const id = await liveSession(alice, { problemCount: 2, mixMode: "manual", mix: { easy: 1, medium: 1, hard: 0 } });
    await as(bob, () => api.join(roomId, id));
    const slugs = (await body<StateResponse>(await as(alice, () => api.state(roomId, id)))).snapshot!.problems.map((p) => p.slug!);
    const outside = [...catalog.easy, ...catalog.medium, ...catalog.hard].find((p) => !slugs.includes(p.slug))!;
    return { id, slugs, outside };
  }

  async function rowsFor(userId: string) {
    return getTestDb().select().from(submissions).where(eq(submissions.userId, userId));
  }

  it("a participant inside the window → 202 and the row carries the session id", async () => {
    const { id, slugs } = await liveWithSlugs();
    const res = await as(bob, () => api.submit(slugs[0], { language: "python", code: CODE, roomSessionId: id }));
    expect(res.status).toBe(202);
    const [row] = await rowsFor(bob.id);
    expect(row).toMatchObject({ kind: "submit", roomSessionId: id, status: "queued" });
  });

  it("without roomSessionId during live → 202, never counted; Run ignores the session id", async () => {
    const { id, slugs } = await liveWithSlugs();
    expect((await as(bob, () => api.submit(slugs[0], { language: "python", code: CODE }))).status).toBe(202);
    expect((await as(bob, () => api.run(slugs[1], { language: "python", code: CODE, roomSessionId: id }))).status).toBe(202);
    const rows = await rowsFor(bob.id);
    expect(rows.map((r) => [r.kind, r.roomSessionId])).toEqual(expect.arrayContaining([["submit", null], ["run", null]]));
  });

  it.each([
    ["an unknown session", async () => ({ user: bob, sessionId: UNKNOWN_ID }), 404, "session_not_found"],
    ["a non-member", async (ctx: Awaited<ReturnType<typeof liveWithSlugs>>) => ({ user: mallory, sessionId: ctx.id }), 404, "session_not_found"],
    ["a member who has not joined", async (ctx: Awaited<ReturnType<typeof liveWithSlugs>>) => ({ user: carol, sessionId: ctx.id }), 409, "join_first"],
  ] as const)("%s is rejected and writes no row", async (_name, who, status, code) => {
    const ctx = await liveWithSlugs();
    const { user, sessionId } = await who(ctx);
    const before = await dbSnapshot();
    const res = await as(user, () => api.submit(ctx.slugs[0], { language: "python", code: CODE, roomSessionId: sessionId }));
    expect(res.status).toBe(status);
    expect(await body(res)).toMatchObject({ code });
    expect(await dbSnapshot()).toBe(before);
  });

  it("a problem that is not part of the session → 400; a malformed id → 400; no rows", async () => {
    const { id, outside, slugs } = await liveWithSlugs();
    const before = await dbSnapshot();
    const res = await as(bob, () => api.submit(outside.slug, { language: "python", code: CODE, roomSessionId: id }));
    expect(res.status).toBe(400);
    expect(await body(res)).toMatchObject({ code: "not_in_session", error: "This problem is not part of the session" });
    expect((await as(bob, () => api.submit(slugs[0], { language: "python", code: CODE, roomSessionId: "nope" }))).status).toBe(400);
    expect(await dbSnapshot()).toBe(before);
  });

  it("a session that is not live (lobby, after ends_at, ended by the host) → 409 'would not count'", async () => {
    const { id: lobbyId } = await createLobby();
    const lobbySlug = (await body<{ lobby: LobbyView }>(await as(alice, () => api.lobby(roomId, lobbyId)))).lobby.slots[0].problem!.slug;
    const inLobby = await as(alice, () => api.submit(lobbySlug, { language: "python", code: CODE, roomSessionId: lobbyId }));
    expect(inLobby.status).toBe(409);
    expect(await body(inLobby)).toMatchObject({
      code: "session_ended",
      error: "The session has ended; this submission would not count. Submit without the session?",
    });
    await as(alice, () => api.cancel(roomId, lobbyId));

    const { id, slugs } = await liveWithSlugs();
    await shiftSessionWindow(id, new Date(Date.now() - 91 * MIN));
    const expired = await as(bob, () => api.submit(slugs[0], { language: "python", code: CODE, roomSessionId: id }));
    expect(expired.status).toBe(409);
    // The lazy close ran on the way.
    expect(await sessionRow(id)).toMatchObject({ status: "finished", endReason: "time" });
    expect(await rowsFor(bob.id)).toEqual([]);
  });

  it("a removed member who was a participant → 404; another room's session cannot be borrowed", async () => {
    const { id, slugs } = await liveWithSlugs();
    await as(alice, () => api.remove(roomId, bob.id));
    expect((await as(bob, () => api.submit(slugs[0], { language: "python", code: CODE, roomSessionId: id }))).status).toBe(404);

    // Mallory has her own room with a live session; carol is not in it.
    const { room: other } = await createRoom({ owner: mallory });
    const foreign = await createRoomSession({
      roomId: other.id,
      hostId: mallory.id,
      status: "live",
      startedAt: new Date(Date.now() - MIN),
      problems: [{ problemId: catalog.easy[0].id, difficulty: "easy" }],
      participants: [mallory.id],
    });
    expect((await as(carol, () => api.submit("easy-1", { language: "python", code: CODE, roomSessionId: foreign.id }))).status).toBe(404);
    expect(await rowsFor(carol.id)).toEqual([]);
  });

  it("the window is re-checked inside the insert transaction (a session that ended after the pre-check)", async () => {
    const { id, slugs } = await liveWithSlugs();
    const [problem] = await getTestDb().select().from(problemsTable).where(eq(problemsTable.slug, slugs[0]));
    await getTestDb().update(roomSessions).set({ status: "finished", endedAt: new Date(), endReason: "host" }).where(eq(roomSessions.id, id));
    const outcome = await insertWithLimits(
      getTestDb(),
      { userId: bob.id, problemId: problem.id, kind: "submit", language: "python", code: CODE, customInput: null, roomSessionId: id },
      { maxActive: 2, ratePerMin: 5 },
    );
    expect(outcome).toMatchObject({ ok: false, reason: "session", rejection: { status: 409, code: "session_ended" } });
    expect(await rowsFor(bob.id)).toEqual([]);
  });

  it("submit right at the end races with End: either 202 before the end or 409, never a row after ended_at", async () => {
    const { id, slugs } = await liveWithSlugs();
    const [sub, end] = await Promise.all([
      as(bob, () => api.submit(slugs[0], { language: "python", code: CODE, roomSessionId: id })),
      (async () => {
        await signIn(alice);
        return api.end(roomId, id);
      })(),
    ]);
    expect(end.status).toBe(200);
    const row = await sessionRow(id);
    const rows = await rowsFor(bob.id);
    if (sub.status === 202) expect(rows[0].createdAt.getTime()).toBeLessThan(row.endedAt!.getTime());
    else expect(rows).toEqual([]);
  });
});

// --- Membership matrix and negative cases (AC-S-SEC-1, AC-S-SEC-4) ---------

type Ctx = { roomId: string; sessionId: string };
type SessionRoute = { name: string; call: (c: Ctx, h?: H, b?: unknown) => Promise<Response>; body: unknown; mutating: boolean };

const SESSION_ROUTES: SessionRoute[] = [
  { name: "draw", call: (c, h, b) => api.draw(c.roomId, c.sessionId, b, h), body: {}, mutating: true },
  { name: "reroll", call: (c, h, b) => api.reroll(c.roomId, c.sessionId, "1", b, h), body: {}, mutating: true },
  { name: "reroll-all", call: (c, h, b) => api.rerollAll(c.roomId, c.sessionId, b, h), body: {}, mutating: true },
  { name: "pin", call: (c, h, b) => api.pin(c.roomId, c.sessionId, "1", b, h), body: { slug: "easy-1" }, mutating: true },
  { name: "join", call: (c, h, b) => api.join(c.roomId, c.sessionId, b, h), body: {}, mutating: true },
  { name: "leave", call: (c, h, b) => api.leave(c.roomId, c.sessionId, b, h), body: {}, mutating: true },
  { name: "start", call: (c, h, b) => api.start(c.roomId, c.sessionId, b, h), body: {}, mutating: true },
  { name: "end", call: (c, h, b) => api.end(c.roomId, c.sessionId, b, h), body: {}, mutating: true },
  { name: "cancel", call: (c, h, b) => api.cancel(c.roomId, c.sessionId, b, h), body: {}, mutating: true },
  { name: "state", call: (c) => api.state(c.roomId, c.sessionId), body: null, mutating: false },
  { name: "lobby", call: (c) => api.lobby(c.roomId, c.sessionId), body: null, mutating: false },
  { name: "problem-search", call: (c) => api.search(c.roomId, c.sessionId, "easy"), body: null, mutating: false },
];

describe("uniform 404 for non-members and cross-room ids (AC-S-SEC-1)", () => {
  async function shape(res: Response) {
    return { status: res.status, body: await res.text(), cache: res.headers.get("cache-control") };
  }

  it.each(SESSION_ROUTES.map((r) => [r.name, r] as const))("%s", async (_name, route) => {
    const { id } = await createLobby();
    const { room: otherRoom } = await createRoom({ owner: mallory });
    const otherSession = await createRoomSession({ roomId: otherRoom.id, hostId: mallory.id });
    const before = await dbSnapshot();
    const unknown = await shape(await as(alice, () => route.call({ roomId, sessionId: UNKNOWN_ID }, undefined, route.body)));
    expect(unknown).toEqual({ status: 404, body: JSON.stringify({ error: "Session not found" }), cache: "no-store" });
    // A non-member of the room, with a real session id.
    expect(await shape(await as(mallory, () => route.call({ roomId, sessionId: id }, undefined, route.body)))).toEqual(unknown);
    // A member of this room with another room's session id (IDOR).
    expect(await shape(await as(alice, () => route.call({ roomId, sessionId: otherSession.id }, undefined, route.body)))).toEqual(unknown);
    // Malformed ids.
    expect(await shape(await as(alice, () => route.call({ roomId: "not-a-uuid", sessionId: id }, undefined, route.body)))).toEqual(unknown);
    expect(await shape(await as(alice, () => route.call({ roomId, sessionId: "1" }, undefined, route.body)))).toEqual(unknown);
    expect(await dbSnapshot()).toBe(before);
  });

  it("create session: non-member and unknown room get the room 404", async () => {
    const a = await as(mallory, () => api.create(roomId));
    const b = await as(alice, () => api.create(UNKNOWN_ID));
    expect(a.status).toBe(404);
    expect(await a.text()).toBe(await b.text());
    expect(await getTestDb().$count(roomSessions)).toBe(0);
  });
});

describe("negative cases per mutating route (AC-S-SEC-4)", () => {
  const MUTATING = [
    { name: "create", call: (c: Ctx, h?: H, b?: unknown) => api.create(c.roomId, b, h), body: {} },
    ...SESSION_ROUTES.filter((r) => r.mutating),
  ];

  it.each(MUTATING.map((r) => [r.name, r] as const))("%s: 403 / 401 / 400 / 413, each writes nothing", async (_name, route) => {
    const { id } = await createLobby();
    const c = { roomId, sessionId: id };
    const before = await dbSnapshot();
    expect((await as(alice, () => route.call(c, { "Content-Type": "text/plain" }, route.body))).status).toBe(403);
    expect((await as(alice, () => route.call(c, { Origin: "https://evil.example" }, route.body))).status).toBe(403);
    expect((await as(null, () => route.call(c, undefined, route.body))).status).toBe(401);
    const extra = { ...(route.body as object), extra: 1 };
    expect((await as(alice, () => route.call(c, undefined, extra))).status).toBe(400);
    expect((await as(alice, () => route.call(c, undefined, "{not json"))).status).toBe(400);
    expect((await as(alice, () => route.call(c, undefined, JSON.stringify({ pad: "x".repeat(5000) })))).status).toBe(413);
    expect(await dbSnapshot()).toBe(before);
  });

  it("session creation is limited to 10 per room per hour (DB count) → 429 with Retry-After", async () => {
    for (let i = 0; i < 10; i++) {
      const { id } = await createLobby();
      expect((await as(alice, () => api.cancel(roomId, id))).status).toBe(200);
    }
    const res = await as(alice, () => api.create(roomId));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(3000);
  });

  it("the room members table is untouched by session routes", async () => {
    const before = await getTestDb().select().from(roomMembers);
    const id = await liveSession();
    await as(bob, () => api.join(roomId, id));
    await as(alice, () => api.end(roomId, id));
    expect(await getTestDb().select().from(roomMembers)).toEqual(before);
  });
});
