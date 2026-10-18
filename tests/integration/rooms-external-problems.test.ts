// Rooms: LeetCode problems (docs/specs/rooms-external-problems.md) through the
// real route handlers and the test database: the room's LeetCode list
// (authorization matrix, validation, limits), LeetCode slots in the lobby
// (host only, hidden from non-hosts until the start), self-reported solves
// (participants, live, server time, undo), and a mixed session end to end
// through finalize(), ratings, results, history, member stats and the
// timeline, with the query budgets those tests already enforce. No request
// to leetcode.com is made anywhere.
import { and, asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createDb, schema, type Db } from "@/server/db";
import {
  roomEvents,
  roomExternalProblems,
  roomMembers,
  roomSessionParticipants,
  roomSessionProblems,
  roomSessionResults,
  roomSessions,
  submissions,
} from "@/server/db/schema";

const state = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  cookies: new Map<string, string>(),
  seed: 7,
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
import { GET as bankGetRoute, POST as bankPostRoute } from "@/app/api/rooms/[roomId]/external-problems/route";
import { POST as presetsRoute } from "@/app/api/rooms/[roomId]/presets/route";
import { POST as drawRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/draw/route";
import { POST as endRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/end/route";
import { POST as externalRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/external/route";
import { POST as joinRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/join/route";
import { GET as lobbyRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/lobby/route";
import { POST as pinRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/slots/[position]/pin/route";
import { POST as rerollRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/slots/[position]/reroll/route";
import { POST as selfReportRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/slots/[position]/self-report/route";
import { POST as startRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/start/route";
import { GET as stateRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/state/route";
import { POST as createRoute } from "@/app/api/rooms/[roomId]/sessions/route";
import type { BankView } from "@/lib/rooms/external";
import type { StateResponse } from "@/lib/rooms/events";
import type { LobbyView } from "@/lib/rooms/session-view";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { signSessionToken } from "@/server/auth/token";
import { getEnv } from "@/server/env";
import { roomSettingsLimiter } from "@/server/rooms/defaults";
import { loadCalibration } from "@/server/rooms/draw";
import { lobbyExternalLimiter, selfReportLimiter } from "@/server/rooms/external";
import { getMemberTimeline, getRoomHistory, getRoomMemberStats } from "@/server/rooms/history";
import { loadSessionRatings } from "@/server/rooms/ratings";
import { getSessionResults, type FinishedResults } from "@/server/rooms/results";
import { statePollLimiter } from "@/server/rooms/state";

import { finalize, toFinalFields } from "../../worker/queue";
import { closeTestDb, createProblem, createTestCases, createUser, getTestDb, resetTestDb, testDbUrl } from "../helpers/db";
import { createRoom, shiftSessionWindow } from "../helpers/rooms";

const ORIGIN = new URL(getEnv().AUTH_URL).origin;
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const MIN = 60_000;
const TWO_SUM = "https://leetcode.com/problems/two-sum/";

type User = Awaited<ReturnType<typeof createUser>>;

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

async function as<T>(user: User | null, fn: () => Promise<T>): Promise<T> {
  state.cookies.clear();
  if (user) state.cookies.set(SESSION_COOKIE, await signSessionToken(user.id));
  return fn();
}

type H = Record<string, string>;
const api = {
  bank: (r: string) => bankGetRoute(get(`/api/rooms/${r}/external-problems`), params({ roomId: r })),
  bankPost: (r: string, b: unknown, h?: H) => bankPostRoute(post(`/api/rooms/${r}/external-problems`, b, h), params({ roomId: r })),
  presets: (r: string, b: unknown) => presetsRoute(post(`/api/rooms/${r}/presets`, b), params({ roomId: r })),
  create: (r: string, b: unknown = {}) => createRoute(post(`/api/rooms/${r}/sessions`, b), params({ roomId: r })),
  draw: (r: string, s: string, b: unknown) => drawRoute(post(`${base(r, s)}/draw`, b), params({ roomId: r, sessionId: s })),
  external: (r: string, s: string, b: unknown, h?: H) =>
    externalRoute(post(`${base(r, s)}/external`, b, h), params({ roomId: r, sessionId: s })),
  selfReport: (r: string, s: string, position: string, b: unknown, h?: H) =>
    selfReportRoute(post(`${base(r, s)}/slots/${position}/self-report`, b, h), params({ roomId: r, sessionId: s, position })),
  reroll: (r: string, s: string, position: string) =>
    rerollRoute(post(`${base(r, s)}/slots/${position}/reroll`, {}), params({ roomId: r, sessionId: s, position })),
  pin: (r: string, s: string, position: string, b: unknown) =>
    pinRoute(post(`${base(r, s)}/slots/${position}/pin`, b), params({ roomId: r, sessionId: s, position })),
  join: (r: string, s: string) => joinRoute(post(`${base(r, s)}/join`, {}), params({ roomId: r, sessionId: s })),
  start: (r: string, s: string) => startRoute(post(`${base(r, s)}/start`, {}), params({ roomId: r, sessionId: s })),
  end: (r: string, s: string) => endRoute(post(`${base(r, s)}/end`, {}), params({ roomId: r, sessionId: s })),
  lobby: (r: string, s: string) => lobbyRoute(get(`${base(r, s)}/lobby`), params({ roomId: r, sessionId: s })),
  state: (r: string, s: string, q = "") => stateRoute(get(`${base(r, s)}/state${q}`), params({ roomId: r, sessionId: s })),
  submit: (slug: string, b: unknown) => submitRoute(post(`/api/problems/${slug}/submit`, b), params({ slug })),
};

async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

function countingDb() {
  const { pool } = createDb(testDbUrl());
  const counter = { n: 0 };
  const counting = drizzle(pool, { schema, logger: { logQuery: () => void counter.n++ } }) as unknown as Db;
  return { db: counting, counter, close: () => pool.end() };
}

let alice: User; // owner
let bob: User; // member, hosts sessions
let carol: User; // member
let mallory: User; // not a member
let roomId: string;
let easy: Awaited<ReturnType<typeof createProblem>>[];

beforeAll(() => {
  state.db = getTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  statePollLimiter.reset();
  roomSettingsLimiter.reset();
  lobbyExternalLimiter.reset();
  selfReportLimiter.reset();
  alice = await createUser({ username: "alice" });
  bob = await createUser({ username: "bob" });
  carol = await createUser({ username: "carol" });
  mallory = await createUser({ username: "mallory" });
  easy = [];
  for (let i = 0; i < 4; i++) {
    const p = await createProblem({ difficulty: "easy", slug: `easy-${i + 1}`, title: `Easy ${i + 1}`, authorRating: 1200 });
    await createTestCases(p.id, 2);
    easy.push(p);
  }
  const { room } = await createRoom({ owner: alice, members: [bob, carol], name: "Saturday Algo Club" });
  roomId = room.id;
});
afterAll(closeTestDb);

async function addToBank(url = TWO_SUM, extra: Record<string, unknown> = {}) {
  const res = await as(alice, () => api.bankPost(roomId, { action: "add", url, ...extra }));
  expect(res.status).toBe(201);
  return (await json<{ entry: { id: string; slug: string; title: string } }>(res)).entry;
}

/** A lobby hosted by `host`, difficulty mode with `n` easy problems (deterministic). */
async function lobbyOf(host: User, n = 1) {
  const res = await as(host, () =>
    api.create(roomId, { mode: "difficulty", problemCount: n, mixMode: "manual", mix: { easy: n, medium: 0, hard: 0 } }),
  );
  expect(res.status).toBe(201);
  return json<{ id: string; lobby: LobbyView }>(res);
}

async function addExternal(host: User, sessionId: string, body: Record<string, unknown>) {
  const res = await as(host, () => api.external(roomId, sessionId, { action: "add", ...body }));
  return { res, data: res.ok ? (await json<{ lobby: LobbyView }>(res)).lobby : null };
}

async function slotRows(sessionId: string) {
  return getTestDb()
    .select()
    .from(roomSessionProblems)
    .where(eq(roomSessionProblems.sessionId, sessionId))
    .orderBy(asc(roomSessionProblems.position));
}

// --- The room's LeetCode list ----------------------------------------------------

describe("LeetCode list: authorization matrix", () => {
  it("members read it, the owner edits it, everyone else gets 401/404/403", async () => {
    expect((await as(null, () => api.bank(roomId))).status).toBe(401);
    expect((await as(mallory, () => api.bank(roomId))).status).toBe(404);
    expect((await as(mallory, () => api.bank(UNKNOWN_ID))).status).toBe(404);
    expect(await json(await as(bob, () => api.bank(roomId)))).toEqual({ problems: [], canEdit: false });

    const add = { action: "add", url: TWO_SUM };
    expect((await as(null, () => api.bankPost(roomId, add))).status).toBe(401);
    expect((await as(mallory, () => api.bankPost(roomId, add))).status).toBe(404);
    expect((await as(bob, () => api.bankPost(roomId, add))).status).toBe(403);
    expect((await as(alice, () => api.bankPost(roomId, add, { Origin: "https://evil.example" }))).status).toBe(403);
    const created = await as(alice, () => api.bankPost(roomId, add));
    expect(created.status).toBe(201);
    const view = await json<BankView>(await as(carol, () => api.bank(roomId)));
    expect(view.problems).toEqual([
      expect.objectContaining({ slug: "two-sum", title: "Two Sum", difficulty: null, rating: null }),
    ]);
    expect(JSON.stringify(view)).not.toContain("https://");

    const id = view.problems[0].id;
    expect((await as(bob, () => api.bankPost(roomId, { action: "delete", id }))).status).toBe(403);
    expect((await as(alice, () => api.bankPost(roomId, { action: "delete", id: UNKNOWN_ID }))).status).toBe(404);
    expect((await as(alice, () => api.bankPost(roomId, { action: "delete", id }))).status).toBe(200);
    expect((await json<BankView>(await as(alice, () => api.bank(roomId)))).problems).toEqual([]);
  });

  it("an entry of another room is not found (no IDOR through ids)", async () => {
    const { room: other } = await createRoom({ owner: mallory });
    const res = await as(mallory, () => api.bankPost(other.id, { action: "add", url: TWO_SUM }));
    const foreign = (await json<{ entry: { id: string } }>(res)).entry.id;
    expect((await as(alice, () => api.bankPost(roomId, { action: "delete", id: foreign }))).status).toBe(404);
    expect((await as(alice, () => api.bankPost(roomId, { action: "update", id: foreign, title: "x" }))).status).toBe(404);
    const lobby = await lobbyOf(alice);
    expect((await addExternal(alice, lobby.id, { bankId: foreign })).res.status).toBe(404);
  });
});

describe("LeetCode list: validation and limits", () => {
  it.each([
    "javascript:alert(1)",
    "http://leetcode.com/problems/two-sum/",
    "https://leetcode.cn/problems/two-sum/",
    "https://www.leetcode.com/problems/two-sum/",
    "https://leetcode.com.evil.io/problems/two-sum/",
    "https://evil.io/?https://leetcode.com/problems/two-sum/",
    "https://user@leetcode.com/problems/two-sum/",
    "https://leetcode.com:443/problems/two-sum/",
    "https://leetcode.com/problems/../accounts/login/",
    "https://leetcode.com/problems/two-sum/../../evil",
    "https://leetcode.com/problems/%74wo-sum/",
    "https://leеtcode.com/problems/two-sum/",
    "https://leetcode.com/problems/two​sum/",
    "//leetcode.com/problems/two-sum/",
    "https://leetcode.com/contest/weekly-contest-1/",
    "",
  ])("rejects %j with 400 and writes nothing", async (url) => {
    const res = await as(alice, () => api.bankPost(roomId, { action: "add", url }));
    expect(res.status).toBe(400);
    expect(await getTestDb().select().from(roomExternalProblems)).toEqual([]);
  });

  it("stores only the slug; title defaults to Title Case; strips trailing path and query", async () => {
    const e = await addToBank("  https://leetcode.com/problems/3sum-closest/description/?envType=daily#x  ", {
      difficulty: "medium",
      rating: 1600,
    });
    expect(e).toMatchObject({ slug: "3sum-closest", title: "3sum Closest" });
    const [row] = await getTestDb().select().from(roomExternalProblems);
    expect(row).toMatchObject({ slug: "3sum-closest", difficulty: "medium", rating: 1600, addedBy: alice.id });
  });

  it("rejects bad titles, ratings, extra keys and duplicates", async () => {
    const bad = async (b: Record<string, unknown>) => (await as(alice, () => api.bankPost(roomId, { action: "add", url: TWO_SUM, ...b }))).status;
    expect(await bad({ title: "Two\u0000Sum" })).toBe(400);
    expect(await bad({ title: "x‮evil" })).toBe(400);
    expect(await bad({ title: "x".repeat(101) })).toBe(400);
    expect(await bad({ rating: 4001 })).toBe(400);
    expect(await bad({ rating: 1.5 })).toBe(400);
    expect(await bad({ difficulty: "insane" })).toBe(400);
    expect(await bad({ href: TWO_SUM })).toBe(400);
    expect(await bad({ title: "<img src=x onerror=alert(1)>" })).toBe(201);
    const dup = await as(alice, () => api.bankPost(roomId, { action: "add", url: "https://leetcode.com/problems/two-sum" }));
    expect(dup.status).toBe(409);
    // The title is stored as text, rendered as text (React escapes it); never HTML.
    const [row] = await getTestDb().select().from(roomExternalProblems);
    expect(row.title).toBe("<img src=x onerror=alert(1)>");
  });

  it("update: title, difficulty, rating and the link (a taken slug → 409)", async () => {
    const a = await addToBank();
    await addToBank("https://leetcode.com/problems/house-robber/");
    const upd = await as(alice, () => api.bankPost(roomId, { action: "update", id: a.id, title: "", difficulty: "easy", rating: 1200 }));
    expect(upd.status).toBe(200);
    expect((await json<{ entry: unknown }>(upd)).entry).toMatchObject({ title: "Two Sum", difficulty: "easy", rating: 1200 });
    const taken = await as(alice, () => api.bankPost(roomId, { action: "update", id: a.id, url: "https://leetcode.com/problems/house-robber/" }));
    expect(taken.status).toBe(409);
    const moved = await as(alice, () => api.bankPost(roomId, { action: "update", id: a.id, url: "https://leetcode.com/problems/coin-change/", rating: null }));
    expect((await json<{ entry: unknown }>(moved)).entry).toMatchObject({ slug: "coin-change", rating: null });
  });

  it("a room keeps at most 100 entries (409 beyond)", async () => {
    await getTestDb()
      .insert(roomExternalProblems)
      .values(Array.from({ length: 100 }, (_, i) => ({ roomId, slug: `p-${i}`, title: `P ${i}` })));
    const res = await as(alice, () => api.bankPost(roomId, { action: "add", url: TWO_SUM }));
    expect(res.status).toBe(409);
  });

  it("CHECKs reject what the API would never write", async () => {
    const bad = (values: Partial<typeof roomExternalProblems.$inferInsert>) =>
      getTestDb().insert(roomExternalProblems).values({ roomId, slug: "ok", title: "Ok", ...values });
    await expect(bad({ slug: "Two-Sum" })).rejects.toThrow();
    await expect(bad({ slug: "../x" })).rejects.toThrow();
    await expect(bad({ title: "" })).rejects.toThrow();
    await expect(bad({ title: "a\nb" })).rejects.toThrow();
    await expect(bad({ rating: 5000 })).rejects.toThrow();
  });
});

// --- Lobby: LeetCode slots ------------------------------------------------------------

describe("lobby: LeetCode slots", () => {
  it("only the host/owner configures slots; members get 403, strangers 404", async () => {
    const entry = await addToBank();
    const { id } = await lobbyOf(bob, 1);
    expect((await addExternal(carol, id, { bankId: entry.id })).res.status).toBe(403);
    expect((await addExternal(mallory, id, { bankId: entry.id })).res.status).toBe(404);
    expect((await as(null, () => api.external(roomId, id, { action: "add", bankId: entry.id }))).status).toBe(401);
    expect((await addExternal(bob, id, { bankId: UNKNOWN_ID })).res.status).toBe(404);
    expect((await addExternal(bob, id, { bankId: entry.id, extra: 1 })).res.status).toBe(400);
    // The owner manages any session of the room (as for draws).
    expect((await addExternal(alice, id, { bankId: entry.id })).res.status).toBe(200);
  });

  it("adding appends a slot at the end; titles and slugs stay hidden from non-hosts until the start", async () => {
    const entry = await addToBank(TWO_SUM, { difficulty: "easy", rating: 1300 });
    const { id } = await lobbyOf(bob, 2);
    const { data: lobby } = await addExternal(bob, id, { bankId: entry.id });
    expect(lobby!.problemCount).toBe(3);
    expect(lobby!.settings.external).toBe(1);
    expect(lobby!.slots.map((s) => s.position)).toEqual([1, 2, 3]);
    expect(lobby!.slots[2]).toMatchObject({
      position: 3,
      difficulty: "easy",
      external: { slug: "two-sum", title: "Two Sum", rating: 1300, bankId: entry.id },
    });

    await as(carol, () => api.join(roomId, id));
    const carolLobby = await as(carol, () => api.lobby(roomId, id));
    const text = await carolLobby.text();
    expect(text).not.toMatch(/two-sum|Two Sum|1300/);
    const parsed = JSON.parse(text) as { lobby: LobbyView };
    expect(parsed.lobby.slots[2]).toEqual({ position: 3, difficulty: "easy", pinned: false, tags: [], external: {} });
    const carolState = await (await as(carol, () => api.state(roomId, id))).text();
    expect(carolState).not.toMatch(/two-sum|Two Sum|1300/);

    expect((await as(bob, () => api.start(roomId, id))).status).toBe(200);
    const live = await json<StateResponse>(await as(carol, () => api.state(roomId, id)));
    expect(live.snapshot!.problems[2]).toEqual({
      position: 3,
      title: "Two Sum",
      difficulty: "easy",
      tags: [],
      external: { slug: "two-sum", rating: 1300 },
    });
  });

  it("paste a link: owner may save it to the list, a non-owner host may not", async () => {
    const { id } = await lobbyOf(bob, 1);
    const denied = await addExternal(bob, id, { url: TWO_SUM, saveToBank: true });
    expect(denied.res.status).toBe(403);
    const ok = await addExternal(bob, id, { url: "https://leetcode.com/problems/two-sum/submissions/", title: "My two sum" });
    expect(ok.data!.slots[1].external).toMatchObject({ slug: "two-sum", title: "My two sum", bankId: null });
    expect(await getTestDb().select().from(roomExternalProblems)).toEqual([]);

    // The owner may save while adding to bob's lobby.
    const saved = await addExternal(alice, id, { url: "https://leetcode.com/problems/coin-change/", saveToBank: true });
    const bank = await getTestDb().select().from(roomExternalProblems);
    expect(bank).toEqual([expect.objectContaining({ slug: "coin-change", title: "Coin Change" })]);
    expect(saved.data!.slots[2].external).toMatchObject({ slug: "coin-change", bankId: bank[0].id });
  });

  it("duplicates, the 8-slot cap and hostile links are refused", async () => {
    const { id } = await lobbyOf(alice, 6);
    expect((await addExternal(alice, id, { url: TWO_SUM })).res.status).toBe(200);
    expect((await addExternal(alice, id, { url: "https://leetcode.com/problems/two-sum" })).res.status).toBe(409);
    expect((await addExternal(alice, id, { url: "https://leetcode.com/problems/coin-change/" })).res.status).toBe(200);
    const full = await addExternal(alice, id, { url: "https://leetcode.com/problems/house-robber/" });
    expect(full.res.status).toBe(409);
    expect((await addExternal(alice, id, { url: "javascript:alert(1)//leetcode.com/problems/x" })).res.status).toBe(400);
  });

  it("re-roll and pin refuse LeetCode positions; remove renumbers and shrinks the session", async () => {
    const { id } = await lobbyOf(alice, 2);
    await addExternal(alice, id, { url: TWO_SUM });
    await addExternal(alice, id, { url: "https://leetcode.com/problems/coin-change/" });
    expect((await as(alice, () => api.reroll(roomId, id, "3"))).status).toBe(409);
    expect((await as(alice, () => api.pin(roomId, id, "4", { slug: easy[3].slug }))).status).toBe(409);
    expect((await as(alice, () => api.reroll(roomId, id, "1"))).status).toBe(200);

    expect((await as(carol, () => api.external(roomId, id, { action: "remove", position: 3 }))).status).toBe(403);
    expect((await as(alice, () => api.external(roomId, id, { action: "remove", position: 1 }))).status).toBe(409);
    const removed = await as(alice, () => api.external(roomId, id, { action: "remove", position: 3 }));
    const lobby = (await json<{ lobby: LobbyView }>(removed)).lobby;
    expect(lobby.problemCount).toBe(3);
    expect(lobby.settings.external).toBe(1);
    expect(lobby.slots.map((s) => [s.position, s.external?.slug ?? null])).toEqual([
      [1, null],
      [2, null],
      [3, "coin-change"],
    ]);
  });

  it("a preset count reserves empty LeetCode slots; Start waits until they are picked", async () => {
    const saved = await as(alice, () =>
      api.presets(roomId, {
        action: "save",
        makeDefault: true,
        preset: {
          name: "Mixed",
          problemCount: 3,
          durationMin: 60,
          mode: "difficulty",
          challenge: "balanced",
          tags: [],
          mix: { easy: 2, medium: 0, hard: 0 },
          avoidSolved: false,
          rated: true,
          external: 1,
        },
      }),
    );
    expect(saved.status).toBe(200);
    const created = await json<{ id: string; lobby: LobbyView }>(await as(alice, () => api.create(roomId)));
    expect(created.lobby).toMatchObject({ problemCount: 3, settings: { external: 1 } });
    expect(created.lobby.slots.map((s) => s.position)).toEqual([1, 2]);
    const blocked = await as(alice, () => api.start(roomId, created.id));
    expect(blocked.status).toBe(409);
    expect(await json(blocked)).toMatchObject({ code: "slots_incomplete", error: "Pick the LeetCode problems first" });
    const filled = await addExternal(alice, created.id, { url: TWO_SUM });
    expect(filled.data!.problemCount).toBe(3);
    expect(filled.data!.slots[2]).toMatchObject({ position: 3, external: { slug: "two-sum" } });
    expect((await as(alice, () => api.start(roomId, created.id))).status).toBe(200);
  });

  it("the draw keeps LeetCode slots last; a custom mix adds up to the drawn slots; fewer slots than LeetCode ones → 400", async () => {
    const { id } = await lobbyOf(alice, 2);
    await addExternal(alice, id, { url: TWO_SUM });
    const wrongMix = await as(alice, () => api.draw(roomId, id, { mixMode: "manual", mix: { easy: 3, medium: 0, hard: 0 } }));
    expect(wrongMix.status).toBe(400);
    const grown = await as(alice, () => api.draw(roomId, id, { problemCount: 4, mixMode: "manual", mix: { easy: 3, medium: 0, hard: 0 } }));
    expect(grown.status).toBe(200);
    const rows = await slotRows(id);
    expect(rows.map((r) => [r.position, r.externalSlug])).toEqual([
      [1, null],
      [2, null],
      [3, null],
      [4, "two-sum"],
    ]);
    const shrunk = await as(alice, () => api.draw(roomId, id, { problemCount: 1, external: 1, mixMode: "suggested" }));
    expect(shrunk.status).toBe(200);
    expect((await slotRows(id)).map((r) => [r.position, r.externalSlug])).toEqual([[1, "two-sum"]]);
    expect((await as(alice, () => api.draw(roomId, id, { external: 2 }))).status).toBe(400);
  });

  it("the CHECK keeps a slot either ours or a LeetCode snapshot", async () => {
    const { id } = await lobbyOf(alice, 1);
    const insert = (values: Partial<typeof roomSessionProblems.$inferInsert>) =>
      getTestDb().insert(roomSessionProblems).values({ sessionId: id, position: 5, ...values });
    await expect(insert({ problemId: easy[1].id, difficulty: "easy", externalSlug: "two-sum", externalTitle: "Two Sum" })).rejects.toThrow();
    await expect(insert({ difficulty: "easy" })).rejects.toThrow();
    await expect(insert({ externalSlug: "Two Sum", externalTitle: "x" })).rejects.toThrow();
    await expect(insert({ externalSlug: "two-sum" })).rejects.toThrow();
    await expect(insert({ externalSlug: "two-sum", externalTitle: "Two Sum", ratingAtStart: 1500 })).rejects.toThrow();
    await insert({ externalSlug: "two-sum", externalTitle: "Two Sum" });
  });
});

// --- Live: self-reported solves ---------------------------------------------------------

/** Live session hosted by alice: easy problem at 1, LeetCode two-sum at 2; bob and carol joined. */
async function mixedLive(durationMin = 60) {
  const res = await as(alice, () =>
    api.create(roomId, { mode: "difficulty", problemCount: 1, durationMin, mixMode: "manual", mix: { easy: 1, medium: 0, hard: 0 } }),
  );
  const { id } = await json<{ id: string }>(res);
  await addExternal(alice, id, { url: TWO_SUM, difficulty: "easy" });
  await as(bob, () => api.join(roomId, id));
  await as(carol, () => api.join(roomId, id));
  expect((await as(alice, () => api.start(roomId, id))).status).toBe(200);
  return id;
}

async function judgedSolve(user: User, sessionId: string, accepted = true) {
  const [slot] = await getTestDb()
    .select()
    .from(roomSessionProblems)
    .where(and(eq(roomSessionProblems.sessionId, sessionId), eq(roomSessionProblems.position, 1)));
  const slug = easy.find((p) => p.id === slot.problemId)!.slug;
  const sub = await json<{ id: string }>(await as(user, () => api.submit(slug, { language: "python", code: "pass", roomSessionId: sessionId })));
  await getTestDb().update(submissions).set({ status: "running", startedAt: new Date() }).where(eq(submissions.id, sub.id));
  await finalize(
    getTestDb(),
    sub.id,
    toFinalFields("submit", {
      status: accepted ? "accepted" : "wrong_answer",
      passedCount: accepted ? 2 : 0,
      totalCount: 2,
      runtimeMs: 1,
      memoryKb: 1,
      failedTestIndex: accepted ? null : 0,
      failedCase: null,
      caseResults: [],
      stdout: "",
      error: null,
    }),
  );
}

async function eventsOf(sessionId: string) {
  return getTestDb()
    .select({ type: roomEvents.type, actor: roomEvents.actorUserId, payload: roomEvents.payload })
    .from(roomEvents)
    .where(eq(roomEvents.sessionId, sessionId))
    .orderBy(asc(roomEvents.id));
}

describe("self-reported solves", () => {
  it("participants only, live only, LeetCode slots only, strict body", async () => {
    const { id: lobbyId } = await lobbyOf(alice, 1);
    await addExternal(alice, lobbyId, { url: TWO_SUM });
    expect((await as(alice, () => api.selfReport(roomId, lobbyId, "2", { solved: true }))).status).toBe(409);
    expect((await as(alice, () => api.start(roomId, lobbyId))).status).toBe(200);

    expect((await as(null, () => api.selfReport(roomId, lobbyId, "2", { solved: true }))).status).toBe(401);
    expect((await as(mallory, () => api.selfReport(roomId, lobbyId, "2", { solved: true }))).status).toBe(404);
    expect((await as(carol, () => api.selfReport(roomId, lobbyId, "2", { solved: true }))).status).toBe(403); // not joined
    expect((await as(alice, () => api.selfReport(roomId, lobbyId, "1", { solved: true }))).status).toBe(409); // judged slot
    expect((await as(alice, () => api.selfReport(roomId, lobbyId, "3", { solved: true }))).status).toBe(404);
    expect((await as(alice, () => api.selfReport(roomId, lobbyId, "9", { solved: true }))).status).toBe(404);
    expect((await as(alice, () => api.selfReport(roomId, lobbyId, "2", { solved: true, solveSeconds: 1 }))).status).toBe(400);
    expect((await as(alice, () => api.selfReport(roomId, lobbyId, "2", { solved: true }, { Origin: "https://evil.example" }))).status).toBe(403);
    expect((await as(alice, () => api.selfReport(roomId, lobbyId, "2", { solved: true }))).status).toBe(200);
  });

  it("server time since the start; scored like a solve; undo and mark again; events for everyone", async () => {
    const id = await mixedLive();
    await shiftSessionWindow(id, new Date(Date.now() - 10 * MIN));
    const marked = await as(bob, () => api.selfReport(roomId, id, "2", { solved: true }));
    expect(marked.status).toBe(200);
    const m = await json<{ solved: boolean; solveSeconds: number }>(marked);
    expect(m.solved).toBe(true);
    expect(m.solveSeconds).toBeGreaterThanOrEqual(600);
    expect(m.solveSeconds).toBeLessThan(620);
    // Idempotent: a second mark keeps the first time.
    expect(await json(await as(bob, () => api.selfReport(roomId, id, "2", { solved: true })))).toMatchObject({ solveSeconds: m.solveSeconds });

    let [p] = await getTestDb()
      .select()
      .from(roomSessionParticipants)
      .where(and(eq(roomSessionParticipants.sessionId, id), eq(roomSessionParticipants.userId, bob.id)));
    expect(p).toMatchObject({ solvedCount: 1, penaltySec: m.solveSeconds, rank: 1 });

    const snap = await json<StateResponse>(await as(carol, () => api.state(roomId, id)));
    const bobRow = snap.snapshot!.participants.find((x) => x.username === "bob")!;
    expect(bobRow.cells).toEqual([
      { position: 2, attempts: 1, wrongBefore: 0, solveSeconds: m.solveSeconds, firstSolver: true, solvedBefore: false },
    ]);

    await shiftSessionWindow(id, new Date(Date.now() - 20 * MIN));
    expect((await as(carol, () => api.selfReport(roomId, id, "2", { solved: true }))).status).toBe(200);
    expect((await as(bob, () => api.selfReport(roomId, id, "2", { solved: false }))).status).toBe(200);
    [p] = await getTestDb()
      .select()
      .from(roomSessionParticipants)
      .where(and(eq(roomSessionParticipants.sessionId, id), eq(roomSessionParticipants.userId, bob.id)));
    expect(p).toMatchObject({ solvedCount: 0, penaltySec: 0 });
    // Undo of something not marked is a no-op.
    expect((await as(bob, () => api.selfReport(roomId, id, "2", { solved: false }))).status).toBe(200);
    expect((await as(bob, () => api.selfReport(roomId, id, "2", { solved: true }))).status).toBe(200);

    const events = (await eventsOf(id)).filter((e) => e.type === "problem_solved" || e.type === "solve_undone");
    expect(events.map((e) => [e.type, e.actor === bob.id ? "bob" : "carol"])).toEqual([
      ["problem_solved", "bob"],
      ["problem_solved", "carol"],
      ["solve_undone", "bob"],
      ["problem_solved", "bob"],
    ]);
    expect(events[0].payload).toMatchObject({ position: 2, selfReported: true, firstSolver: true, wrongBefore: 0 });
    expect(events[1].payload).toMatchObject({ selfReported: true, firstSolver: false });
    expect(events[2].payload).toEqual({ position: 2, solvedCount: 0 });
    expect(events[3].payload).toMatchObject({ selfReported: true, firstSolver: false });

    // Poller: the events reach other members with a fresh snapshot.
    const fresh = await json<StateResponse>(await as(alice, () => api.state(roomId, id, "?after=0")));
    expect(fresh.events.some((e) => e.type === "solve_undone")).toBe(true);
    expect(fresh.snapshot).toBeDefined();
  });

  it("no marks after the end", async () => {
    const id = await mixedLive();
    expect((await as(alice, () => api.end(roomId, id))).status).toBe(200);
    const res = await as(bob, () => api.selfReport(roomId, id, "2", { solved: true }));
    expect(res.status).toBe(409);
  });
});

// --- A mixed session end to end ------------------------------------------------------------

describe("mixed session end to end", () => {
  it("finalize + self-report → scores, ratings on judged problems only, results, history, stats, timeline", async () => {
    const id = await mixedLive();
    await shiftSessionWindow(id, new Date(Date.now() - 30 * MIN));
    await judgedSolve(bob, id); // bob: judged accept on Problem 1
    expect((await as(bob, () => api.selfReport(roomId, id, "2", { solved: true }))).status).toBe(200);
    expect((await as(carol, () => api.selfReport(roomId, id, "2", { solved: true }))).status).toBe(200); // carol: LeetCode only
    expect((await as(alice, () => api.end(roomId, id))).status).toBe(200);

    const [session] = await getTestDb().select().from(roomSessions).where(eq(roomSessions.id, id));
    expect(session).toMatchObject({ status: "finished", rated: true });
    expect(session.ratedAt).not.toBeNull();

    const ratings = (await loadSessionRatings(getTestDb(), id))!;
    expect(ratings.state).toBe("applied");
    expect(ratings.problems.map((p) => p.position)).toEqual([1]);
    const byName = new Map(ratings.participants.map((p) => [p.username, p]));
    expect(byName.get("bob")).toMatchObject({ active: true });
    expect(byName.get("bob")!.delta).toBeGreaterThan(0);
    // carol only self-reported: not active, rating unchanged (no judged submit).
    expect(byName.get("carol")).toMatchObject({ active: false, delta: 0 });
    const members = await getTestDb().select().from(roomMembers).where(eq(roomMembers.roomId, roomId));
    expect(members.find((m) => m.userId === carol.id)).toMatchObject({ ratedPairs: 0, ratedSessions: 0 });
    expect(members.find((m) => m.userId === bob.id)).toMatchObject({ ratedPairs: 1, ratedSessions: 1 });
    const slots = await slotRows(id);
    expect(slots[1]).toMatchObject({ externalSlug: "two-sum", ratingAtStart: null, ratingDelta: null });

    // Results: the LeetCode slot has no internal slug, carries `external`, counts in totals.
    const c = countingDb();
    let results: FinishedResults;
    try {
      results = (await getSessionResults(c.db, roomId, id, alice.id)) as FinishedResults;
      // Same budget as any rated session: Q0, session, problems, participants + the 3-query rating ledger.
      expect(c.counter.n).toBe(7);
    } finally {
      await c.close();
    }
    expect(results.problems[1]).toMatchObject({ position: 2, slug: null, title: "Two Sum", external: { slug: "two-sum", rating: null } });
    const bobR = results.participants.find((p) => p.username === "bob")!;
    expect(bobR).toMatchObject({ solvedCount: 2, rank: 1 });
    expect(bobR.cells[1]).toMatchObject({ solveSeconds: expect.any(Number), solution: { visible: false } });
    expect(results.participants.find((p) => p.username === "carol")).toMatchObject({ solvedCount: 1, ratingChange: null });
    expect(results.summaries[1]).toMatchObject({ solvedBy: 2 });

    // History mini-matrix (budget unchanged).
    const h = countingDb();
    try {
      const history = (await getRoomHistory(h.db, roomId, alice.id))!;
      expect(h.counter.n).toBeLessThanOrEqual(5);
      const item = history.sessions[0];
      expect(item.problems.map((p) => [p.position, p.slug, p.external?.slug ?? null])).toEqual([
        [1, easy.find((e) => e.id === slots[0].problemId)!.slug, null],
        [2, null, "two-sum"],
      ]);
      expect(item.standings.find((s) => s.username === "carol")!.cells).toEqual([
        expect.objectContaining({ position: 2, solveSeconds: expect.any(Number), firstSolver: false }),
      ]);
    } finally {
      await h.close();
    }

    // Member stats count self-reported solves; attendance is unaffected.
    const stats = (await getRoomMemberStats(getTestDb(), roomId, alice.id, "all"))!;
    const statBy = new Map(stats.rows.map((r) => [r.username, r]));
    expect(statBy.get("bob")).toMatchObject({ sessions: 1, solved: 2, wins: 1 });
    expect(statBy.get("carol")).toMatchObject({ sessions: 1, solved: 1 });

    // Timeline lists the LeetCode problem, flagged.
    const timeline = (await getMemberTimeline(getTestDb(), roomId, alice.id, "carol"))!;
    expect(timeline.sessions[0].problems.map((p) => [p.position, p.slug, p.external ?? false])).toEqual([
      [1, expect.any(String), false],
      [2, "two-sum", true],
    ]);

    // Calibration (difficulty mode): carol never submitted to the judge, so she is not an active pair.
    const calibration = await loadCalibration(getTestDb(), roomId);
    expect(calibration.counts.easy.pairs).toBe(1);
  });

  it("a session with only LeetCode problems starts unrated and never touches ratings", async () => {
    const { id } = await lobbyOf(alice, 1);
    await addExternal(alice, id, { url: TWO_SUM });
    const shrunk = await as(alice, () => api.draw(roomId, id, { problemCount: 1, mixMode: "suggested" }));
    expect(shrunk.status).toBe(200);
    expect((await json<{ lobby: LobbyView }>(shrunk)).lobby.slots.map((s) => s.external?.slug)).toEqual(["two-sum"]);
    await as(bob, () => api.join(roomId, id));
    expect((await as(alice, () => api.start(roomId, id))).status).toBe(200);
    expect((await as(bob, () => api.selfReport(roomId, id, "1", { solved: true }))).status).toBe(200);
    expect((await as(alice, () => api.end(roomId, id))).status).toBe(200);
    const [session] = await getTestDb().select().from(roomSessions).where(eq(roomSessions.id, id));
    expect(session).toMatchObject({ rated: false, ratedAt: null });
    expect((await loadSessionRatings(getTestDb(), id))!.state).toBe("unrated");
    const results = (await getSessionResults(getTestDb(), roomId, id, bob.id)) as FinishedResults;
    expect(results.participants.find((p) => p.username === "bob")).toMatchObject({ solvedCount: 1, rank: 1 });
    const [{ n }] = (
      await getTestDb().execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM room_members WHERE room_id = ${roomId} AND rated_pairs > 0`)
    ).rows;
    expect(Number(n)).toBe(0);
  });

  it("removing a list entry keeps the session's snapshot", async () => {
    const entry = await addToBank();
    const { id } = await lobbyOf(alice, 1);
    await addExternal(alice, id, { bankId: entry.id });
    expect((await as(alice, () => api.bankPost(roomId, { action: "delete", id: entry.id }))).status).toBe(200);
    const rows = await slotRows(id);
    expect(rows[1]).toMatchObject({ externalSlug: "two-sum", externalTitle: "Two Sum", externalProblemId: null });
    const results = await getTestDb().select().from(roomSessionResults).where(eq(roomSessionResults.sessionId, id));
    expect(results).toEqual([]);
  });
});
