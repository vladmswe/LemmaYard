// Rooms v2, per-room ratings end to end through the real route handlers and
// the test database (docs/specs/rooms-v2.md §4–§8, §11, owner decisions D1–D3;
// AC-V2-RAT-2..6, AC-V2-SEL-1/4, AC-V2-DEF-1). The draw RNG is seeded.
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/server/db";
import {
  problems as problemsTable,
  roomEvents,
  roomMembers,
  roomSessionParticipants,
  roomSessionProblems,
  roomSessions,
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

import { GET as myRatingGet, POST as myRatingPost } from "@/app/api/me/rating/route";
import { POST as inviteRoute } from "@/app/api/rooms/[roomId]/invite/route";
import { POST as presetsRoute } from "@/app/api/rooms/[roomId]/presets/route";
import { POST as profileRoute } from "@/app/api/rooms/[roomId]/profile/route";
import { GET as roomGet } from "@/app/api/rooms/[roomId]/route";
import { POST as scheduleRoute } from "@/app/api/rooms/[roomId]/schedule/route";
import { POST as drawRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/draw/route";
import { POST as endRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/end/route";
import { POST as joinRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/join/route";
import { GET as lobbyRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/lobby/route";
import { GET as ratingsRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/ratings/route";
import { POST as rerollAllRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/reroll-all/route";
import { POST as pinRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/slots/[position]/pin/route";
import { POST as rerollRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/slots/[position]/reroll/route";
import { POST as startRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/start/route";
import { GET as stateRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/state/route";
import { POST as createSessionRoute } from "@/app/api/rooms/[roomId]/sessions/route";
import { POST as joinRoomRoute } from "@/app/api/rooms/join/route";
import { POST as createRoomRoute } from "@/app/api/rooms/route";
import type { LobbyView } from "@/lib/rooms/session-view";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { signSessionToken } from "@/server/auth/token";
import { getEnv } from "@/server/env";
import { roomSettingsLimiter } from "@/server/rooms/defaults";
import { joinAddressLimiter, joinUserLimiter } from "@/server/rooms/membership";
import { applyDueSessionRatings, applySessionRatings, type SessionRatingsView } from "@/server/rooms/ratings";
import { selfRatingLimiter } from "@/server/rooms/self-rating";
import { statePollLimiter } from "@/server/rooms/state";

import { finalize, toFinalFields } from "../../worker/queue";
import { closeTestDb, createProblem, createSubmission, createUser, getTestDb, resetTestDb } from "../helpers/db";
import { createRoom, createSessionSubmission, shiftSessionWindow } from "../helpers/rooms";

const ORIGIN = new URL(getEnv().AUTH_URL).origin;
const MIN = 60_000;

type User = Awaited<ReturnType<typeof createUser>>;
type Problem = Awaited<ReturnType<typeof createProblem>>;
type H = Record<string, string>;

function post(path: string, body: unknown, headers: H = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });
}
const get = (path: string) => new Request(`${ORIGIN}${path}`);
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const base = (r: string, s: string) => `/api/rooms/${r}/sessions/${s}`;

async function as<T>(user: User | null, fn: () => Promise<T>): Promise<T> {
  state.cookies.clear();
  if (user) state.cookies.set(SESSION_COOKIE, await signSessionToken(user.id));
  return fn();
}
async function body<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

const api = {
  createRoom: (b: unknown) => createRoomRoute(post("/api/rooms", b)),
  invite: (r: string) => inviteRoute(post(`/api/rooms/${r}/invite`, { action: "rotate", expiresInDays: 7 }), params({ roomId: r })),
  joinRoom: (token: string) => joinRoomRoute(post("/api/rooms/join", { token })),
  room: (r: string) => roomGet(get(`/api/rooms/${r}`), params({ roomId: r })),
  profile: (r: string, b: unknown, h?: H) => profileRoute(post(`/api/rooms/${r}/profile`, b, h), params({ roomId: r })),
  presets: (r: string, b: unknown) => presetsRoute(post(`/api/rooms/${r}/presets`, b), params({ roomId: r })),
  schedule: (r: string, b: unknown) => scheduleRoute(post(`/api/rooms/${r}/schedule`, b), params({ roomId: r })),
  create: (r: string, b: unknown = {}) => createSessionRoute(post(`/api/rooms/${r}/sessions`, b), params({ roomId: r })),
  draw: (r: string, s: string, b: unknown = {}) => drawRoute(post(`${base(r, s)}/draw`, b), params({ roomId: r, sessionId: s })),
  join: (r: string, s: string) => joinRoute(post(`${base(r, s)}/join`, {}), params({ roomId: r, sessionId: s })),
  start: (r: string, s: string) => startRoute(post(`${base(r, s)}/start`, {}), params({ roomId: r, sessionId: s })),
  end: (r: string, s: string) => endRoute(post(`${base(r, s)}/end`, {}), params({ roomId: r, sessionId: s })),
  lobby: (r: string, s: string) => lobbyRoute(get(`${base(r, s)}/lobby`), params({ roomId: r, sessionId: s })),
  state: (r: string, s: string) => stateRoute(get(`${base(r, s)}/state`), params({ roomId: r, sessionId: s })),
  ratings: (r: string, s: string) => ratingsRoute(get(`${base(r, s)}/ratings`), params({ roomId: r, sessionId: s })),
  pin: (r: string, s: string, position: string, b: unknown) =>
    pinRoute(post(`${base(r, s)}/slots/${position}/pin`, b), params({ roomId: r, sessionId: s, position })),
  reroll: (r: string, s: string, position: string) =>
    rerollRoute(post(`${base(r, s)}/slots/${position}/reroll`, {}), params({ roomId: r, sessionId: s, position })),
  rerollAll: (r: string, s: string) => rerollAllRoute(post(`${base(r, s)}/reroll-all`, {}), params({ roomId: r, sessionId: s })),
  myRating: () => myRatingGet(),
  setMyRating: (b: unknown, h?: H) => myRatingPost(post("/api/me/rating", b, h)),
};

/** The 20 seed problems with their meta.json ratings (§8.1). */
const CATALOG: [string, "easy" | "medium" | "hard", number][] = [
  ["fizz-buzz", "easy", 1050],
  ["reverse-string", "easy", 1080],
  ["contains-duplicate", "easy", 1120],
  ["palindrome-number", "easy", 1150],
  ["valid-anagram", "easy", 1150],
  ["two-sum", "easy", 1180],
  ["binary-search", "easy", 1250],
  ["valid-parentheses", "easy", 1270],
  ["climbing-stairs", "easy", 1300],
  ["best-time-to-buy-and-sell-stock", "easy", 1330],
  ["maximum-subarray", "easy", 1420],
  ["house-robber", "medium", 1500],
  ["product-of-array-except-self", "medium", 1560],
  ["merge-intervals", "medium", 1580],
  ["longest-substring-without-repeating-characters", "medium", 1620],
  ["coin-change", "medium", 1680],
  ["longest-common-subsequence", "medium", 1720],
  ["edit-distance", "hard", 1900],
  ["trapping-rain-water", "hard", 1950],
  ["longest-valid-parentheses", "hard", 2150],
];

let alice: User; // owner, 1620
let bob: User; // 1540
let carol: User; // 1450
let dan: User; // 1380, provisional
let erin: User; // member who joins and never submits
let mallory: User; // not a member
let bySlug: Map<string, Problem>;
let roomId: string;

async function setRating(user: User, rating: number, ratedPairs: number, room = roomId) {
  await getTestDb()
    .update(roomMembers)
    .set({ rating, ratedPairs, ratedSessions: Math.floor(ratedPairs / 4), ratingSource: "default" })
    .where(and(eq(roomMembers.roomId, room), eq(roomMembers.userId, user.id)));
}

async function member(user: User, room = roomId) {
  const [row] = await getTestDb()
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, room), eq(roomMembers.userId, user.id)));
  return row;
}

async function adjustOf(slugs: string[]) {
  const rows = await getTestDb()
    .select({ slug: problemsTable.slug, adjust: problemsTable.ratingAdjust })
    .from(problemsTable)
    .where(inArray(problemsTable.slug, slugs));
  return Object.fromEntries(rows.map((r) => [r.slug, r.adjust]));
}

/** A judged session submit: inserted running inside the window, then finalized like the worker does. */
async function judge(
  user: User,
  slug: string,
  sessionId: string,
  status: "accepted" | "wrong_answer" | "running" = "accepted",
  createdAt = new Date(Date.now() - 1000),
) {
  const row = await createSessionSubmission({
    userId: user.id,
    problemId: bySlug.get(slug)!.id,
    roomSessionId: sessionId,
    status: "running",
    createdAt,
  });
  if (status !== "running") {
    await finalize(
      getTestDb(),
      row.id,
      toFinalFields("submit", { status, passedCount: status === "accepted" ? 2 : 0, totalCount: 2, runtimeMs: 1, memoryKb: 1, failedTestIndex: status === "accepted" ? null : 0, failedCase: null, caseResults: [], stdout: "", error: null }),
    );
  }
  return row;
}

const SPEC_SLUGS = ["best-time-to-buy-and-sell-stock", "maximum-subarray", "house-robber", "longest-substring-without-repeating-characters"];

/** §6.5 A's lobby as a live manual-mode session with the spec's four problems pinned. */
async function specSession(extra: Record<string, unknown> = {}) {
  await setRating(alice, 1620, 20);
  await setRating(bob, 1540, 20);
  await setRating(carol, 1450, 20);
  await setRating(dan, 1380, 0);
  const res = await as(alice, () => api.create(roomId, { mode: "manual", problemCount: 4, durationMin: 90, ...extra }));
  expect(res.status).toBe(201);
  const { id, lobby } = await body<{ id: string; lobby: LobbyView }>(res);
  expect(lobby.slots).toEqual([]);
  for (const [i, slug] of SPEC_SLUGS.entries()) {
    expect((await as(alice, () => api.pin(roomId, id, String(i + 1), { slug }))).status).toBe(200);
  }
  for (const u of [bob, carol, dan, erin]) expect((await as(u, () => api.join(roomId, id))).status).toBe(200);
  expect((await as(alice, () => api.start(roomId, id))).status).toBe(200);
  // Started ten minutes ago, so submits stamped "now" fall inside the window.
  await shiftSessionWindow(id, new Date(Date.now() - 10 * MIN));
  return id;
}

beforeAll(() => {
  state.db = getTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  statePollLimiter.reset();
  roomSettingsLimiter.reset();
  selfRatingLimiter.reset();
  joinUserLimiter.reset();
  joinAddressLimiter.reset();
  state.seed = 42;
  alice = await createUser({ username: "alice" });
  bob = await createUser({ username: "bob" });
  carol = await createUser({ username: "carol" });
  dan = await createUser({ username: "dan" });
  erin = await createUser({ username: "erin" });
  mallory = await createUser({ username: "mallory" });
  bySlug = new Map();
  for (const [slug, difficulty, rating] of CATALOG) {
    bySlug.set(slug, await createProblem({ slug, title: slug, difficulty, authorRating: rating, tags: [difficulty === "hard" ? "string" : "array"] }));
  }
  const { room } = await createRoom({ owner: alice, members: [bob, carol, dan, erin], name: "Saturday Algo Club" });
  roomId = room.id;
});
afterAll(closeTestDb);

// --- Rating application (AC-V2-RAT-1/2) -------------------------------------

describe("rating application after a rated session", () => {
  it("snapshots at start, then applies §6.5 B once at the end: +6, +15, +26, −22; erin (no submits) 0; problems drift", async () => {
    const id = await specSession();
    const starts = await getTestDb()
      .select({ userId: roomSessionParticipants.userId, r: roomSessionParticipants.ratingAtStart })
      .from(roomSessionParticipants)
      .where(eq(roomSessionParticipants.sessionId, id));
    const startOf = new Map(starts.map((s) => [s.userId, s.r]));
    expect([alice, bob, carol, dan].map((u) => startOf.get(u.id))).toEqual([1620, 1540, 1450, 1380]);
    expect(startOf.get(erin.id)).toBe(1500); // seeded lazily at the lobby join (default)
    const slots = await getTestDb()
      .select({ r: roomSessionProblems.ratingAtStart })
      .from(roomSessionProblems)
      .where(eq(roomSessionProblems.sessionId, id))
      .orderBy(asc(roomSessionProblems.position));
    expect(slots.map((s) => s.r)).toEqual([1330, 1420, 1500, 1620]);

    for (const u of [alice, bob, carol]) for (const slug of SPEC_SLUGS.slice(0, 3)) await judge(u, slug, id);
    await judge(dan, SPEC_SLUGS[0], id);
    await judge(dan, SPEC_SLUGS[1], id, "wrong_answer");
    // Still live: nothing applied yet.
    expect((await getTestDb().select().from(roomSessions).where(eq(roomSessions.id, id)))[0].ratedAt).toBeNull();

    expect((await as(alice, () => api.end(roomId, id))).status).toBe(200);
    const [session] = await getTestDb().select().from(roomSessions).where(eq(roomSessions.id, id));
    expect(session.ratedAt).not.toBeNull();
    const after = await Promise.all([alice, bob, carol, dan, erin].map((u) => member(u)));
    expect(after.map((m) => [m.rating, m.ratedPairs, m.ratedSessions])).toEqual([
      [1626, 24, 6],
      [1555, 24, 6],
      [1476, 24, 6],
      [1358, 4, 1],
      [1500, 0, 0],
    ]);
    expect(await adjustOf(SPEC_SLUGS)).toEqual({
      [SPEC_SLUGS[0]]: -5,
      [SPEC_SLUGS[1]]: -2,
      [SPEC_SLUGS[2]]: -4,
      [SPEC_SLUGS[3]]: 5,
    });

    const view = await body<SessionRatingsView>(await as(bob, () => api.ratings(roomId, id)));
    expect(view.state).toBe("applied");
    const byName = Object.fromEntries(view.participants.map((p) => [p.username, p]));
    expect(byName.alice).toMatchObject({ before: 1620, delta: 6, after: 1626, active: true });
    expect(byName.dan).toMatchObject({ before: 1380, delta: -22, after: 1358, active: true });
    expect(byName.erin).toMatchObject({ before: 1500, delta: 0, active: false });
    expect(Math.round(byName.alice.expected! * 100) / 100).toBe(2.77);
    expect(view.problems.map((p) => [p.before, p.after])).toEqual([
      [1330, 1325],
      [1420, 1418],
      [1500, 1496],
      [1620, 1625],
    ]);

    // Exactly once: more calls (5 in parallel, separate transactions) change nothing.
    const results = await Promise.all(Array.from({ length: 5 }, () => getTestDb().transaction((tx) => applySessionRatings(tx, id))));
    expect(results.every((r) => !r.applied && r.reason === "already_applied")).toBe(true);
    expect((await member(alice)).ratedPairs).toBe(24);
    expect(await adjustOf([SPEC_SLUGS[0]])).toEqual({ [SPEC_SLUGS[0]]: -5 });
  });

  it("racing finishes (host end, lazy close on a poll, the worker backstop) apply the ratings once", async () => {
    const id = await specSession({ durationMin: 30, rated: true });
    await shiftSessionWindow(id, new Date(Date.now() - 31 * MIN));
    for (const slug of SPEC_SLUGS.slice(0, 2)) await judge(alice, slug, id, "accepted", new Date(Date.now() - 5 * MIN));
    // The session is past ends_at but still 'live': every path below may close it.
    await getTestDb().execute(sql`UPDATE room_sessions SET status = 'live', ended_at = NULL, end_reason = NULL WHERE id = ${id}`);
    await Promise.all([
      as(alice, () => api.end(roomId, id)),
      as(bob, () => api.state(roomId, id)),
      applyDueSessionRatings(getTestDb()),
      getTestDb().transaction((tx) => applySessionRatings(tx, id)),
      as(carol, () => api.state(roomId, id)),
    ]);
    const [session] = await getTestDb().select().from(roomSessions).where(eq(roomSessions.id, id));
    expect(session.status).toBe("finished");
    expect(session.ratedAt).not.toBeNull();
    expect((await member(alice)).ratedPairs).toBe(24);
    expect((await member(alice)).ratedSessions).toBe(6);
    const ended = await getTestDb()
      .select({ id: roomEvents.id })
      .from(roomEvents)
      .where(and(eq(roomEvents.sessionId, id), eq(roomEvents.type, "session_ended")));
    expect(ended).toHaveLength(1);
  });

  it("waits while a submit is judged; the last verdict applies; after 30 minutes the backstop applies anyway", async () => {
    const id = await specSession();
    await judge(alice, SPEC_SLUGS[0], id);
    const pending = await judge(bob, SPEC_SLUGS[0], id, "running");
    expect((await as(alice, () => api.end(roomId, id))).status).toBe(200);
    expect((await body<SessionRatingsView>(await as(carol, () => api.ratings(roomId, id)))).state).toBe("pending");
    expect((await applyDueSessionRatings(getTestDb())).length).toBe(0);
    await finalize(getTestDb(), pending.id, toFinalFields("submit", { status: "accepted", passedCount: 2, totalCount: 2, runtimeMs: 1, memoryKb: 1, failedTestIndex: null, failedCase: null, caseResults: [], stdout: "", error: null }));
    const view = await body<SessionRatingsView>(await as(carol, () => api.ratings(roomId, id)));
    expect(view.state).toBe("applied");
    // bob solved only the 1330 problem: 24 · (1 − 2.38) = −33.
    expect(view.participants.find((p) => p.username === "bob")!.delta).toBe(-33);

    // Second session: a submit stays queued; 31 minutes after the end the worker applies it.
    const second = await specSession();
    await judge(alice, SPEC_SLUGS[0], second);
    await judge(bob, SPEC_SLUGS[1], second, "running");
    expect((await as(alice, () => api.end(roomId, second))).status).toBe(200);
    expect((await applyDueSessionRatings(getTestDb())).length).toBe(0);
    await getTestDb().execute(sql`
      UPDATE room_sessions SET started_at = started_at - interval '2 hours', ends_at = ends_at - interval '2 hours',
        ended_at = ended_at - interval '2 hours' WHERE id = ${second}`);
    expect(await applyDueSessionRatings(getTestDb())).toEqual([second]);
  });

  it("unrated sessions change nothing (explicit off, and short sessions are off by default)", async () => {
    const id = await specSession({ rated: false });
    for (const slug of SPEC_SLUGS) await judge(alice, slug, id);
    expect((await as(alice, () => api.end(roomId, id))).status).toBe(200);
    expect((await member(alice)).rating).toBe(1620);
    expect((await member(alice)).ratedPairs).toBe(20);
    expect(await adjustOf(SPEC_SLUGS)).toEqual(Object.fromEntries(SPEC_SLUGS.map((s) => [s, 0])));
    expect((await body<SessionRatingsView>(await as(bob, () => api.ratings(roomId, id)))).state).toBe("unrated");

    const res = await as(alice, () => api.create(roomId, { problemCount: 4, durationMin: 30 }));
    expect((await body<{ lobby: LobbyView }>(res)).lobby.rated).toBe(false);
  });

  it("ratings are per room: the same person keeps independent ratings in two rooms", async () => {
    const { room: other } = await createRoom({ owner: bob, members: [alice] });
    await setRating(alice, 1900, 40, other.id);
    const id = await specSession();
    for (const slug of SPEC_SLUGS) await judge(alice, slug, id);
    await as(alice, () => api.end(roomId, id));
    expect((await member(alice)).rating).toBeGreaterThan(1620);
    expect((await member(alice, other.id)).rating).toBe(1900);
    expect((await member(alice, other.id)).ratedPairs).toBe(40);
  });
});

// --- Cold start (AC-V2-RAT-4) ---------------------------------------------

describe("starting ratings per room", () => {
  it("joining a room seeds: self-reported → practice top-3 − 100 → 1500", async () => {
    const lc = await createUser({ username: "lc_user", leetcodeRating: 1850 });
    const practiced = await createUser({ username: "practiced" });
    for (const slug of ["best-time-to-buy-and-sell-stock", "maximum-subarray", "house-robber", "fizz-buzz"]) {
      await createSubmission({ userId: practiced.id, problemId: bySlug.get(slug)!.id, kind: "submit", status: "accepted", finishedAt: new Date(), startedAt: new Date() });
    }
    const fresh = await createUser({ username: "fresh" });
    const { url } = await body<{ url: string }>(await as(alice, () => api.invite(roomId)));
    const token = new URL(url).hash.slice(1);
    for (const u of [lc, practiced, fresh]) expect((await as(u, () => api.joinRoom(token))).status).toBe(200);
    expect(await member(lc)).toMatchObject({ rating: 1850, ratingSource: "self_reported", ratedPairs: 0 });
    expect(await member(practiced)).toMatchObject({ rating: Math.round((1500 + 1420 + 1330) / 3 - 100), ratingSource: "practice" });
    expect(await member(fresh)).toMatchObject({ rating: 1500, ratingSource: "default" });
  });

  it("a room creator is seeded at creation; v1 members are seeded lazily at the first lobby", async () => {
    const res = await as(carol, () => api.createRoom({ name: "Carol's room", description: "Weeknights", color: 5 }));
    expect(res.status).toBe(201);
    const { id } = await body<{ id: string }>(res);
    expect(await member(carol, id)).toMatchObject({ rating: 1500, ratingSource: "default" });
    const detail = await body<{ room: { description: string; color: number } }>(await as(carol, () => api.room(id)));
    expect(detail.room).toMatchObject({ description: "Weeknights", color: 5 });

    expect((await member(bob)).rating).toBeNull();
    await as(alice, () => api.create(roomId));
    // Expected participants = all members (only the host joined): everyone is seeded by the rating draw.
    expect((await member(bob)).rating).toBe(1500);
  });

  it("POST /api/me/rating re-seeds rooms without rated pairs, keeps the others; private to its owner", async () => {
    const { room: other } = await createRoom({ owner: bob, members: [dan] });
    await setRating(dan, 1500, 0);
    await setRating(dan, 1700, 16, other.id);
    const res = await as(dan, () => api.setMyRating({ leetcodeRating: 2000 }));
    expect(res.status).toBe(200);
    expect(await body(res)).toMatchObject({ leetcodeRating: 2000, reseeded: 1, kept: 1 });
    expect(await member(dan)).toMatchObject({ rating: 2000, ratingSource: "self_reported" });
    expect(await member(dan, other.id)).toMatchObject({ rating: 1700, ratedPairs: 16 });
    const mine = await body<{ leetcodeRating: number; rooms: { roomId: string; rating: number; provisional: boolean }[] }>(
      await as(dan, () => api.myRating()),
    );
    expect(mine.leetcodeRating).toBe(2000);
    expect(mine.rooms.map((r) => r.rating).sort()).toEqual([1700, 2000]);
    // Nobody else ever sees the number.
    // The room rating it seeded is visible to co-members (D3), the self-report field never is.
    const detail = JSON.stringify(await body(await as(alice, () => api.room(roomId))));
    expect(detail).not.toMatch(/leetcode/i);
    expect(await body(await as(alice, () => api.myRating()))).toMatchObject({ leetcodeRating: null });

    expect((await as(null, () => api.setMyRating({ leetcodeRating: 1 }))).status).toBe(401);
    expect((await as(dan, () => api.setMyRating({ leetcodeRating: 4001 }))).status).toBe(400);
    expect((await as(dan, () => api.setMyRating({ leetcodeRating: 1500, extra: 1 }))).status).toBe(400);
    expect((await as(dan, () => api.setMyRating({ leetcodeRating: 1500 }, { Origin: "https://evil.example" }))).status).toBe(403);
    expect((await as(null, () => api.myRating())).status).toBe(401);
    await as(dan, () => api.setMyRating({ leetcodeRating: null }));
    expect(await member(dan)).toMatchObject({ rating: 1500, ratingSource: "default" });
  });
});

// --- Selection by rating through the routes (AC-V2-SEL-1/4) ----------------

describe("selection by rating through the lobby routes", () => {
  it("new sessions default to By rating (D1): targets from the room's ratings, numbers for the host only", async () => {
    await setRating(alice, 1620, 20);
    await setRating(bob, 1540, 20);
    await setRating(carol, 1450, 20);
    await setRating(dan, 1380, 0);
    await setRating(erin, 1500, 0);
    const res = await as(alice, () => api.create(roomId));
    expect(res.status).toBe(201);
    const { id, lobby } = await body<{ id: string; lobby: LobbyView }>(res);
    expect(lobby).toMatchObject({ mode: "rating", rated: true, problemCount: 4, durationMin: 90, settings: { mode: "rating" } });
    const targets = lobby.slots.map((s) => s.rating!.target!);
    expect(targets).toEqual([...targets].sort((a, b) => a - b));
    for (const s of lobby.slots) {
      expect(Math.abs(s.rating!.deviation!)).toBeLessThanOrEqual(100);
      expect(s.rating!.chance).toBeGreaterThan(0);
    }
    expect(lobby.expected!.perUser.map((u) => u.username).sort()).toEqual(["alice", "bob", "carol", "dan", "erin"]);
    expect(lobby.expected!.target).toBe(0.55);
    const [row] = await getTestDb().select().from(roomSessions).where(eq(roomSessions.id, id));
    expect(row.settings.targets).toEqual(targets);

    // Non-host: chance only; no title, slug or rating anywhere.
    const member = await body<{ lobby: LobbyView }>(await as(bob, () => api.lobby(roomId, id)));
    const text = JSON.stringify(member);
    for (const [slug] of CATALOG) expect(text).not.toContain(slug);
    for (const s of member.lobby.slots) expect(Object.keys(s.rating!)).toEqual(["chance"]);
    expect(member.lobby.expected).toBeUndefined();
    expect(text).not.toMatch(/"target"|"deviation"/);

    // Re-roll in rating mode stays near the slot target; re-roll all keeps the mode.
    const reroll = await body<{ lobby: LobbyView }>(await as(alice, () => api.reroll(roomId, id, "2")));
    expect(reroll.lobby.slots[1].problem!.slug).not.toBe(lobby.slots[1].problem!.slug);
    // The narrowest band with an unused problem wins; the slots taken by the others may push it to ±200.
    expect(Math.abs(reroll.lobby.slots[1].rating!.rating! - targets[1])).toBeLessThanOrEqual(200);
    const all = await body<{ lobby: LobbyView }>(await as(alice, () => api.rerollAll(roomId, id)));
    expect(all.lobby.rerollCount).toBe(2);
    expect(all.lobby.mode).toBe("rating");
  });

  it("switching modes: difficulty (v1 draw and calibration), manual (pins only), back to rating", async () => {
    const { id } = await body<{ id: string }>(await as(alice, () => api.create(roomId)));
    const diff = await body<{ lobby: LobbyView }>(await as(alice, () => api.draw(roomId, id, { mode: "difficulty" })));
    expect(diff.lobby.mode).toBe("difficulty");
    expect(diff.lobby.slots.map((s) => s.difficulty)).toEqual(["easy", "medium", "medium", "hard"]);
    expect(diff.lobby.slots.every((s) => s.rating === undefined)).toBe(true);
    expect(diff.lobby.settings.targets).toBeUndefined();

    const free = CATALOG.map(([slug]) => slug).find((slug) => !diff.lobby.slots.some((s) => s.problem!.slug === slug))!;
    expect((await as(alice, () => api.pin(roomId, id, "3", { slug: free }))).status).toBe(200);
    const manual = await body<{ lobby: LobbyView }>(await as(alice, () => api.draw(roomId, id, { mode: "manual" })));
    expect(manual.lobby.slots.map((s) => [s.position, s.problem!.slug])).toEqual([[3, free]]);
    expect(await body(await as(alice, () => api.start(roomId, id)))).toMatchObject({ code: "slots_incomplete" });
    expect(await body(await as(alice, () => api.rerollAll(roomId, id)))).toMatchObject({ code: "manual_mode" });

    const back = await body<{ lobby: LobbyView }>(await as(alice, () => api.draw(roomId, id, { mode: "rating" })));
    expect(back.lobby.slots).toHaveLength(4);
    expect(back.lobby.slots[2]).toMatchObject({ pinned: true, problem: { slug: free }, rating: { target: null } });
  });
});

// --- Visibility (D3, AC-V2-RAT-6) ------------------------------------------

describe("rating visibility", () => {
  it("members see every member's room rating; non-members and cross-room ids get the uniform 404", async () => {
    const id = await specSession();
    await as(alice, () => api.end(roomId, id));
    const detail = await body<{ members: { username: string; rating: { rating: number | null; provisional: boolean } }[] }>(
      await as(erin, () => api.room(roomId)),
    );
    expect(detail.members.find((m) => m.username === "dan")!.rating).toMatchObject({ rating: 1380, provisional: true });
    expect(detail.members.find((m) => m.username === "alice")!.rating).toMatchObject({ rating: 1620, provisional: false });

    const outsider = await as(mallory, () => api.room(roomId));
    expect(outsider.status).toBe(404);
    const denied = await as(mallory, () => api.ratings(roomId, id));
    expect(denied.status).toBe(404);
    expect(await body(denied)).toEqual({ error: "Session not found" });
    const { room: other } = await createRoom({ owner: mallory });
    expect((await as(mallory, () => api.ratings(other.id, id))).status).toBe(404);
    expect((await as(null, () => api.ratings(roomId, id))).status).toBe(401);
  });
});

// --- Room defaults, presets, schedule (AC-V2-DEF-1) ------------------------

describe("room profile, presets and schedule", () => {
  const preset = (over: Record<string, unknown> = {}) => ({
    name: "Saturday",
    problemCount: 2,
    durationMin: 60,
    mode: "difficulty",
    challenge: "tough",
    tags: [],
    avoidSolved: true,
    rated: true,
    ...over,
  });

  it("profile: owner 200, member 403, non-member 404, bad body 400, foreign Origin 403", async () => {
    const ok = await as(alice, () => api.profile(roomId, { description: "Saturday friends", color: 3 }));
    expect(ok.status).toBe(200);
    expect(await body(ok)).toEqual({ name: "Saturday Algo Club", description: "Saturday friends", color: 3 });
    expect((await as(bob, () => api.profile(roomId, { color: 1 }))).status).toBe(403);
    expect((await as(mallory, () => api.profile(roomId, { color: 1 }))).status).toBe(404);
    expect((await as(alice, () => api.profile(roomId, { color: 9 }))).status).toBe(400);
    expect((await as(alice, () => api.profile(roomId, {}))).status).toBe(400);
    expect((await as(alice, () => api.profile(roomId, { color: 1 }, { Origin: "https://evil.example" }))).status).toBe(403);
    expect((await as(alice, () => api.profile(roomId, { description: "" }))).status).toBe(200);
    expect((await body<{ room: { description: string | null } }>(await as(bob, () => api.room(roomId)))).room.description).toBeNull();
  });

  it("presets: the 6th → 409, member 403; a new session without fields uses the default preset; unknown presetId → 400", async () => {
    const detail0 = await body<{ room: { presets: { id: string; mode: string }[]; defaultPresetId: string } }>(await as(bob, () => api.room(roomId)));
    expect(detail0.room.presets).toHaveLength(1);
    expect(detail0.room.presets[0]).toMatchObject({ id: "default", mode: "rating" });

    // The lazily seeded "Default" counts as the first preset.
    let saved = await body<{ presets: { id: string }[]; defaultPresetId: string; preset: { id: string } }>(
      await as(alice, () => api.presets(roomId, { action: "save", preset: preset(), makeDefault: true })),
    );
    expect(saved.presets.map((p) => p.id)).toEqual(["default", saved.preset.id]);
    expect(saved.defaultPresetId).toBe(saved.preset.id);
    const saturday = saved.preset.id;
    for (let i = 0; i < 3; i++) {
      saved = await body(await as(alice, () => api.presets(roomId, { action: "save", preset: preset({ name: `P${i}`, mode: "rating" }) })));
    }
    expect(saved.presets).toHaveLength(5);
    const sixth = await as(alice, () => api.presets(roomId, { action: "save", preset: preset({ name: "Sixth" }) }));
    expect(sixth.status).toBe(409);
    expect(await body(sixth)).toMatchObject({ code: "too_many_presets" });
    expect((await as(bob, () => api.presets(roomId, { action: "save", preset: preset() }))).status).toBe(403);
    expect((await as(mallory, () => api.presets(roomId, { action: "delete", id: saturday }))).status).toBe(404);
    expect((await as(alice, () => api.presets(roomId, { action: "delete", id: "nope" }))).status).toBe(404);

    const created = await body<{ lobby: LobbyView }>(await as(bob, () => api.create(roomId)));
    expect(created.lobby).toMatchObject({ problemCount: 2, durationMin: 60, mode: "difficulty", settings: { challenge: "tough", presetId: saturday } });
    await as(alice, () => api.end(roomId, created.lobby.sessionId));
    await getTestDb().execute(sql`UPDATE room_sessions SET status = 'cancelled', ended_at = now(), end_reason = 'cancelled' WHERE id = ${created.lobby.sessionId}`);
    const unknown = await as(bob, () => api.create(roomId, { presetId: "nope" }));
    expect(unknown.status).toBe(400);
    expect(await body(unknown)).toMatchObject({ fieldErrors: { presetId: "Unknown preset" } });
    const overridden = await body<{ lobby: LobbyView }>(await as(bob, () => api.create(roomId, { presetId: saved.presets[2].id, problemCount: 3 })));
    expect(overridden.lobby).toMatchObject({ problemCount: 3, mode: "rating" });
  });

  it("schedule: owner sets and clears it; validation; deleting its preset falls back to the default", async () => {
    const { preset: p } = await body<{ preset: { id: string } }>(await as(alice, () => api.presets(roomId, { action: "save", preset: preset() })));
    await as(alice, () => api.presets(roomId, { action: "save", preset: preset({ name: "Other" }) }));
    const schedule = { weekday: 6, time: "18:00", timeZone: "Europe/Kyiv", presetId: p.id };
    const ok = await as(alice, () => api.schedule(roomId, { schedule }));
    expect(ok.status).toBe(200);
    expect((await body<{ room: { schedule: unknown } }>(await as(bob, () => api.room(roomId)))).room.schedule).toEqual(schedule);
    expect((await as(alice, () => api.schedule(roomId, { schedule: { ...schedule, presetId: "nope" } }))).status).toBe(400);
    expect((await as(alice, () => api.schedule(roomId, { schedule: { ...schedule, timeZone: "Mars/Base" } }))).status).toBe(400);
    expect((await as(alice, () => api.schedule(roomId, { schedule: { ...schedule, time: "25:00" } }))).status).toBe(400);
    expect((await as(bob, () => api.schedule(roomId, { schedule: null }))).status).toBe(403);
    expect((await as(mallory, () => api.schedule(roomId, { schedule: null }))).status).toBe(404);

    await as(alice, () => api.presets(roomId, { action: "delete", id: p.id }));
    expect((await body<{ room: { schedule: { presetId: string | null } } }>(await as(bob, () => api.room(roomId)))).room.schedule.presetId).toBeNull();
    expect((await as(alice, () => api.schedule(roomId, { schedule: null }))).status).toBe(200);
    expect((await body<{ room: { schedule: unknown } }>(await as(bob, () => api.room(roomId)))).room.schedule).toBeNull();
  });

  it("owner settings writes are rate limited per room (429 with Retry-After)", async () => {
    for (let i = 0; i < 60; i++) await as(alice, () => api.profile(roomId, { color: i % 8 }));
    const res = await as(alice, () => api.profile(roomId, { color: 1 }));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});
