// Rooms: auto-picked LeetCode problems from the committed catalog
// (docs/specs/leetcode-integration.md AC-LC-4 … -14) through the real route
// handlers and the test database: lobby draws with auto LeetCode slots in
// rating, difficulty and mixed sessions, hand picks surviving re-draws,
// re-roll of one auto slot, presets with an auto count, the search route,
// the kill switch, what non-hosts may see, and Elo unaffected. Nothing is
// requested from leetcode.com: the catalog is bundled.
import { and, asc, eq, isNull } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { type Db } from "@/server/db";
import { roomMembers, roomSessionProblems, roomSessions, submissions } from "@/server/db/schema";

const state = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  cookies: new Map<string, string>(),
  seed: 11,
  catalogOff: false,
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

// Kill switch / invalid data: the loader answers null (AC-LC-13).
vi.mock("@/server/leetcode/catalog", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/leetcode/catalog")>();
  return { ...mod, getLeetCodeCatalog: () => (state.catalogOff ? null : mod.getLeetCodeCatalog()) };
});

import { POST as submitRoute } from "@/app/api/problems/[slug]/submit/route";
import { POST as presetsRoute } from "@/app/api/rooms/[roomId]/presets/route";
import { POST as drawRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/draw/route";
import { POST as endRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/end/route";
import { POST as externalRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/external/route";
import { POST as joinRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/join/route";
import { GET as searchRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/leetcode-search/route";
import { GET as lobbyRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/lobby/route";
import { POST as rerollAllRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/reroll-all/route";
import { POST as startRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/start/route";
import { GET as stateRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/state/route";
import { POST as createRoute } from "@/app/api/rooms/[roomId]/sessions/route";
import type { StateResponse } from "@/lib/rooms/events";
import { calibrationFromCounts, emptyCounts, suggestMix } from "@/lib/rooms/selection";
import { mixOf } from "@/lib/rooms/types";
import type { LobbyView } from "@/lib/rooms/session-view";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { signSessionToken } from "@/server/auth/token";
import { getEnv } from "@/server/env";
import { getLeetCodeCatalog } from "@/server/leetcode/catalog";
import { roomSettingsLimiter } from "@/server/rooms/defaults";
import { lobbyExternalLimiter, selfReportLimiter } from "@/server/rooms/external";
import { getSessionResults, type FinishedResults } from "@/server/rooms/results";
import { statePollLimiter } from "@/server/rooms/state";

import { finalize, toFinalFields } from "../../worker/queue";
import { closeTestDb, createProblem, createTestCases, createUser, getTestDb, resetTestDb } from "../helpers/db";
import { createRoom, shiftSessionWindow } from "../helpers/rooms";

const ORIGIN = new URL(getEnv().AUTH_URL).origin;
const MIN = 60_000;
const TWO_SUM = "https://leetcode.com/problems/two-sum/";

type User = Awaited<ReturnType<typeof createUser>>;

function post(path: string, body: unknown) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
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

const api = {
  presets: (r: string, b: unknown) => presetsRoute(post(`/api/rooms/${r}/presets`, b), params({ roomId: r })),
  create: (r: string, b: unknown = {}) => createRoute(post(`/api/rooms/${r}/sessions`, b), params({ roomId: r })),
  draw: (r: string, s: string, b: unknown) => drawRoute(post(`${base(r, s)}/draw`, b), params({ roomId: r, sessionId: s })),
  external: (r: string, s: string, b: unknown) => externalRoute(post(`${base(r, s)}/external`, b), params({ roomId: r, sessionId: s })),
  rerollAll: (r: string, s: string) => rerollAllRoute(post(`${base(r, s)}/reroll-all`, {}), params({ roomId: r, sessionId: s })),
  search: (r: string, s: string, q = "") => searchRoute(get(`${base(r, s)}/leetcode-search${q}`), params({ roomId: r, sessionId: s })),
  join: (r: string, s: string) => joinRoute(post(`${base(r, s)}/join`, {}), params({ roomId: r, sessionId: s })),
  start: (r: string, s: string) => startRoute(post(`${base(r, s)}/start`, {}), params({ roomId: r, sessionId: s })),
  end: (r: string, s: string) => endRoute(post(`${base(r, s)}/end`, {}), params({ roomId: r, sessionId: s })),
  lobby: (r: string, s: string) => lobbyRoute(get(`${base(r, s)}/lobby`), params({ roomId: r, sessionId: s })),
  state: (r: string, s: string) => stateRoute(get(`${base(r, s)}/state?after=0`), params({ roomId: r, sessionId: s })),
  submit: (slug: string, b: unknown) => submitRoute(post(`/api/problems/${slug}/submit`, b), params({ slug })),
};

async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

let alice: User; // owner
let bob: User; // member
let carol: User; // member
let mallory: User; // not a member
let roomId: string;
let problems: Awaited<ReturnType<typeof createProblem>>[];

beforeAll(() => {
  state.db = getTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  state.catalogOff = false;
  state.seed = 11;
  statePollLimiter.reset();
  roomSettingsLimiter.reset();
  lobbyExternalLimiter.reset();
  selfReportLimiter.reset();
  alice = await createUser({ username: "alice" });
  bob = await createUser({ username: "bob" });
  carol = await createUser({ username: "carol" });
  mallory = await createUser({ username: "mallory" });
  problems = [];
  const spec = [
    ["easy", 1150],
    ["easy", 1250],
    ["easy", 1350],
    ["medium", 1500],
    ["medium", 1600],
    ["medium", 1700],
    ["hard", 1950],
    ["hard", 2100],
  ] as const;
  for (const [i, [difficulty, authorRating]] of spec.entries()) {
    const p = await createProblem({ difficulty, slug: `ours-${i + 1}`, title: `Ours ${i + 1}`, authorRating, tags: i === 0 ? ["union-find"] : [] });
    await createTestCases(p.id, 2);
    problems.push(p);
  }
  const { room } = await createRoom({ owner: alice, members: [bob, carol], name: "LeetCode Club" });
  roomId = room.id;
});
afterAll(closeTestDb);

async function externalRows(sessionId: string) {
  return getTestDb()
    .select()
    .from(roomSessionProblems)
    .where(and(eq(roomSessionProblems.sessionId, sessionId), isNull(roomSessionProblems.problemId)))
    .orderBy(asc(roomSessionProblems.position));
}
async function internalRows(sessionId: string) {
  return (await getTestDb().select().from(roomSessionProblems).where(eq(roomSessionProblems.sessionId, sessionId)))
    .filter((r) => r.problemId !== null)
    .sort((a, b) => a.position - b.position);
}
async function sessionRow(id: string) {
  const [s] = await getTestDb().select().from(roomSessions).where(eq(roomSessions.id, id));
  return s;
}

async function createLobby(host: User, body: Record<string, unknown>) {
  const res = await as(host, () => api.create(roomId, body));
  expect(res.status).toBe(201);
  return json<{ id: string; lobby: LobbyView }>(res);
}

describe("lobby draw with auto LeetCode slots", () => {
  it("rating mode: own ladder after the internal draw; internal picks and targets unchanged (AC-LC-4)", async () => {
    const plain = await createLobby(alice, { mode: "rating", problemCount: 4, external: 2 });
    const plainInternal = (await internalRows(plain.id)).map((r) => [r.position, r.problemId]);
    const plainTargets = (await sessionRow(plain.id)).settings.targets;
    await getTestDb()
      .update(roomSessions)
      .set({ status: "cancelled", endedAt: new Date(), endReason: "cancelled" })
      .where(eq(roomSessions.id, plain.id));

    const auto = await createLobby(alice, { mode: "rating", problemCount: 4, external: 2, leetcodeAuto: true });
    const internal = (await internalRows(auto.id)).map((r) => [r.position, r.problemId]);
    expect(internal).toEqual(plainInternal);
    const s = await sessionRow(auto.id);
    expect(s.settings.targets?.slice(0, 2)).toEqual(plainTargets?.slice(0, 2));
    const lc = await externalRows(auto.id);
    expect(lc.map((r) => r.position)).toEqual([3, 4]);
    expect(lc.every((r) => r.pinned === false && r.externalProblemId === null)).toBe(true);
    expect(s.settings.leetcodeAutoSlugs).toEqual(lc.map((r) => r.externalSlug));
    // Their targets come from a ladder of 2 slots; picks within ±100 when available.
    const t3 = s.settings.targets![2]!;
    const t4 = s.settings.targets![3]!;
    expect(t3).toBeLessThan(t4);
    expect(Math.abs(lc[0].externalRating! - t3)).toBeLessThanOrEqual(100);
    expect(Math.abs(lc[1].externalRating! - t4)).toBeLessThanOrEqual(100);

    // Host view: auto flag, number, estimated difficulty, chance and target.
    const host = (await json<{ lobby: LobbyView }>(await as(alice, () => api.lobby(roomId, auto.id)))).lobby;
    const slot = host.slots.find((x) => x.position === 3)!;
    expect(slot.external).toMatchObject({ auto: true, slug: lc[0].externalSlug, n: expect.any(Number) });
    expect(slot.external?.provenance).toMatchObject({ difficultyEstimated: true, ratingSource: "zerotrac" });
    expect(slot.rating).toMatchObject({ rating: lc[0].externalRating, target: t3, chance: expect.any(Number) });
    expect(host.leetcodeCatalog?.problems).toBeGreaterThan(2000);
  });

  it("difficulty mode: LeetCode slots follow their own suggested mix; a custom mix applies to ours only (AC-LC-5)", async () => {
    const lobby = await createLobby(alice, {
      mode: "difficulty",
      problemCount: 4,
      external: 2,
      leetcodeAuto: true,
      mixMode: "manual",
      mix: { easy: 2, medium: 0, hard: 0 },
    });
    const internal = await internalRows(lobby.id);
    expect(internal.map((r) => r.difficulty)).toEqual(["easy", "easy"]);
    const lc = await externalRows(lobby.id);
    expect(lc).toHaveLength(2);
    // Their own suggested mix for two slots from the room's calibration (none yet: the priors).
    const suggestion = suggestMix({
      problemCount: 2,
      rates: calibrationFromCounts(emptyCounts(), 0).rates,
      challenge: "balanced",
      available: { easy: 100, medium: 100, hard: 100 },
    });
    if (!suggestion.ok) throw new Error();
    expect(mixOf(lc.map((r) => ({ difficulty: r.difficulty! })))).toEqual(suggestion.mix);
    expect((await sessionRow(lobby.id)).settings.mix).toEqual({ easy: 2, medium: 0, hard: 0 });
  });

  it("only LeetCode slots (mixed off): the draw fills them; start unrated", async () => {
    const lobby = await createLobby(alice, { mode: "rating", problemCount: 2, external: 2, leetcodeAuto: true });
    expect(await internalRows(lobby.id)).toHaveLength(0);
    expect(await externalRows(lobby.id)).toHaveLength(2);
    expect((await as(alice, () => api.start(roomId, lobby.id))).status).toBe(200);
    expect((await sessionRow(lobby.id)).rated).toBe(false);
  });

  it("hand picks survive Apply-and-draw and Re-roll all; auto slots are re-picked; positions stay last (AC-LC-9)", async () => {
    const lobby = await createLobby(alice, { mode: "rating", problemCount: 3, external: 2, leetcodeAuto: true });
    // Replace the first auto slot by hand: remove it, then add a pasted link and a catalog pick.
    const first = (await externalRows(lobby.id))[0];
    expect((await as(alice, () => api.external(roomId, lobby.id, { action: "remove", position: first.position }))).status).toBe(200);
    expect((await as(alice, () => api.external(roomId, lobby.id, { action: "add", url: TWO_SUM }))).status).toBe(200);
    const catalogPick = getLeetCodeCatalog()!.visible[10].slug;
    const added = await as(alice, () => api.external(roomId, lobby.id, { action: "add", catalogSlug: catalogPick }));
    expect(added.status).toBe(200);
    let rows = await externalRows(lobby.id);
    expect(rows.map((r) => r.position)).toEqual([2, 3, 4]);
    let settings = (await sessionRow(lobby.id)).settings;
    expect(settings.external).toBe(3);
    const autoBefore = rows.filter((r) => settings.leetcodeAutoSlugs?.includes(r.externalSlug!));
    expect(autoBefore).toHaveLength(1);

    for (let i = 0; i < 3; i++) {
      state.seed = 100 + i;
      expect((await as(alice, () => api.draw(roomId, lobby.id, { challenge: i % 2 ? "tough" : "relaxed" }))).status).toBe(200);
      rows = await externalRows(lobby.id);
      expect(rows.map((r) => r.position)).toEqual([2, 3, 4]);
      expect(rows.slice(0, 2).map((r) => r.externalSlug)).toEqual(["two-sum", catalogPick]);
      settings = (await sessionRow(lobby.id)).settings;
      expect(settings.leetcodeAutoSlugs).toEqual([rows[2].externalSlug]);
    }
    const autoSlug = rows[2].externalSlug;
    expect((await as(alice, () => api.rerollAll(roomId, lobby.id))).status).toBe(200);
    rows = await externalRows(lobby.id);
    expect(rows.slice(0, 2).map((r) => r.externalSlug)).toEqual(["two-sum", catalogPick]);
    expect(rows[2].externalSlug).not.toBe(autoSlug);
    expect((await sessionRow(lobby.id)).settings.leetcodeRerolled).toContain(autoSlug);
    // The unique (session, slug) index held throughout; a hand-picked slot cannot be re-rolled.
    const notAuto = await as(alice, () => api.external(roomId, lobby.id, { action: "reroll", position: 2 }));
    expect(notAuto.status).toBe(409);
    expect((await json(notAuto)).code).toBe("not_auto");
  });

  it("re-roll of one auto slot: new slug, counted, old slug remembered; limit 30 (AC-LC-10)", async () => {
    const lobby = await createLobby(alice, { mode: "rating", problemCount: 2, external: 1, leetcodeAuto: true });
    const before = (await externalRows(lobby.id))[0];
    const count0 = (await sessionRow(lobby.id)).rerollCount;
    const res = await as(alice, () => api.external(roomId, lobby.id, { action: "reroll", position: 2 }));
    expect(res.status).toBe(200);
    const after = (await externalRows(lobby.id))[0];
    expect(after.externalSlug).not.toBe(before.externalSlug);
    expect(after.position).toBe(2);
    const s = await sessionRow(lobby.id);
    expect(s.rerollCount).toBe(count0 + 1);
    expect(s.settings.leetcodeRerolled).toContain(before.externalSlug);
    expect(s.settings.leetcodeAutoSlugs).toEqual([after.externalSlug]);
    // Members cannot re-roll; an internal slot or an empty position is refused.
    expect((await as(bob, () => api.external(roomId, lobby.id, { action: "reroll", position: 2 }))).status).toBe(403);
    expect((await as(alice, () => api.external(roomId, lobby.id, { action: "reroll", position: 1 }))).status).toBe(409);
    await getTestDb().update(roomSessions).set({ rerollCount: 30 }).where(eq(roomSessions.id, lobby.id));
    const limited = await as(alice, () => api.external(roomId, lobby.id, { action: "reroll", position: 2 }));
    expect(limited.status).toBe(409);
    expect((await json(limited)).code).toBe("reroll_limit");
  });

  it("presets carry an auto count: a session from it starts with auto LeetCode slots", async () => {
    const saved = await as(alice, () =>
      api.presets(roomId, {
        action: "save",
        makeDefault: true,
        preset: {
          name: "Mixed",
          problemCount: 3,
          durationMin: 60,
          mode: "rating",
          challenge: "balanced",
          tags: [],
          avoidSolved: true,
          rated: true,
          external: 1,
          leetcodeAuto: true,
        },
      }),
    );
    expect(saved.status).toBe(200);
    const lobby = await createLobby(bob, {});
    const s = await sessionRow(lobby.id);
    expect(s.settings).toMatchObject({ external: 1, leetcodeAuto: true });
    expect(await externalRows(lobby.id)).toHaveLength(1);
    // Members cannot save presets (owner only).
    expect((await as(bob, () => api.presets(roomId, { action: "default", id: "x" }))).status).toBe(403);
  });

  it("topics: LeetCode candidates are filtered by the overlay tags (AC-LC-7; the fallback is unit-tested)", async () => {
    const res = await as(alice, () => api.create(roomId, { mode: "rating", problemCount: 2, external: 1, leetcodeAuto: true, tags: ["union-find"] }));
    expect(res.status).toBe(201);
    const { id, lobby } = await json<{ id: string; lobby: LobbyView }>(res);
    // The overlay tags enough union-find problems: no notice, the pick carries the tag.
    const slug = (await externalRows(id))[0].externalSlug!;
    expect(getLeetCodeCatalog()!.bySlug.get(slug)!.tags).toContain("union-find");
    expect(lobby.notices.some((n) => n.code === "leetcode_topics_ignored")).toBe(false);
  });
});

describe("hidden before the start (AC-LC-11)", () => {
  it("non-host lobby, state and settings JSON contain no slug, title, number, rating or chance of LeetCode slots", async () => {
    const lobby = await createLobby(alice, { mode: "rating", problemCount: 3, external: 2, leetcodeAuto: true });
    await as(bob, () => api.join(roomId, lobby.id));
    await as(alice, () => api.external(roomId, lobby.id, { action: "reroll", position: 3 }));
    const rows = await externalRows(lobby.id);
    const s = await sessionRow(lobby.id);
    const secrets = [
      ...rows.flatMap((r) => [r.externalSlug!, r.externalTitle!, String(r.externalRating)]),
      ...(s.settings.leetcodeRerolled ?? []),
    ];
    for (const slug of rows.map((r) => r.externalSlug!)) secrets.push(String(getLeetCodeCatalog()!.bySlug.get(slug)!.n));
    const view = await json<{ lobby: LobbyView }>(await as(bob, () => api.lobby(roomId, lobby.id)));
    const text = JSON.stringify(view);
    for (const secret of secrets) expect(text).not.toContain(`"${secret}"`);
    for (const secret of secrets.filter((x) => /^\d+$/.test(x))) expect(text).not.toMatch(new RegExp(`[^0-9.]${secret}[^0-9.]`));
    for (const slot of view.lobby.slots.filter((x) => x.external)) {
      expect(slot.external).toEqual({});
      expect(slot.rating).toBeUndefined();
    }
    expect(view.lobby.settings.leetcodeAutoSlugs).toBeUndefined();
    expect(view.lobby.settings.leetcodeRerolled).toBeUndefined();
    expect(view.lobby.settings.targets).toBeUndefined();
    expect(view.lobby.leetcodeCatalog).toBeUndefined();
    const st = JSON.stringify(await json<StateResponse>(await as(bob, () => api.state(roomId, lobby.id))));
    for (const secret of secrets.filter((x) => !/^\d+$/.test(x))) expect(st).not.toContain(secret);
  });

  it("after the start everyone sees the title, the link and the estimated labels", async () => {
    const lobby = await createLobby(alice, { mode: "rating", problemCount: 2, external: 1, leetcodeAuto: true });
    await as(bob, () => api.join(roomId, lobby.id));
    expect((await as(alice, () => api.start(roomId, lobby.id))).status).toBe(200);
    const row = (await externalRows(lobby.id))[0];
    const st = await json<StateResponse>(await as(bob, () => api.state(roomId, lobby.id)));
    const p = st.snapshot!.problems.find((x) => x.position === 2)!;
    expect(p).toMatchObject({ title: row.externalTitle, external: { slug: row.externalSlug, rating: row.externalRating } });
    expect(p.external?.provenance).toMatchObject({ difficultyEstimated: true, ratingSource: "zerotrac" });
  });
});

describe("catalog search route (AC-LC-12)", () => {
  it("host or owner, lobby only, bounded, premium excluded, rate-limited", async () => {
    const lobby = await createLobby(bob, { mode: "rating", problemCount: 2, external: 1 });
    expect((await as(null, () => api.search(roomId, lobby.id))).status).toBe(401);
    expect((await as(mallory, () => api.search(roomId, lobby.id))).status).toBe(404);
    expect((await as(carol, () => api.search(roomId, lobby.id))).status).toBe(403);
    expect((await as(bob, () => api.search(roomId, lobby.id, "?q=" + "x".repeat(61)))).status).toBe(400);
    expect((await as(bob, () => api.search(roomId, lobby.id, "?tag=segment-tree"))).status).toBe(400);
    expect((await as(bob, () => api.search(roomId, lobby.id, "?evil=1"))).status).toBe(400);
    const all = await json<{ problems: { slug: string; n: number }[] }>(await as(bob, () => api.search(roomId, lobby.id)));
    expect(all.problems).toHaveLength(20);
    const owner = await json<{ problems: { slug: string; n: number; difficulty: string; rating: number }[] }>(
      await as(alice, () => api.search(roomId, lobby.id, "?q=746&difficulty=easy&min=1000&max=1400")),
    );
    expect(owner.problems.map((p) => p.slug)).toEqual(["min-cost-climbing-stairs"]);
    expect(Object.keys(owner.problems[0]).sort()).toEqual(["difficulty", "n", "provenance", "rating", "slug", "tags", "title"]);
    const byTitle = await json<{ problems: { title: string }[] }>(await as(bob, () => api.search(roomId, lobby.id, "?q=STAIRS")));
    expect(byTitle.problems.every((p) => p.title.toLowerCase().includes("stairs"))).toBe(true);

    for (let i = 0; i < 60; i++) await as(bob, () => api.search(roomId, lobby.id, "?q=a"));
    expect((await as(bob, () => api.search(roomId, lobby.id, "?q=a"))).status).toBe(429);
    lobbyExternalLimiter.reset();

    await as(bob, () => api.external(roomId, lobby.id, { action: "add", catalogSlug: "min-cost-climbing-stairs" }));
    const again = await json<{ problems: { slug: string }[] }>(await as(bob, () => api.search(roomId, lobby.id, "?q=746")));
    expect(again.problems).toEqual([]);
    await as(bob, () => api.join(roomId, lobby.id));
    await as(bob, () => api.draw(roomId, lobby.id, { problemCount: 2 }));
    expect((await as(bob, () => api.start(roomId, lobby.id))).status).toBe(200);
    expect((await as(bob, () => api.search(roomId, lobby.id))).status).toBe(409);
  });
});

describe("kill switch (AC-LC-13)", () => {
  it("catalog unavailable: auto requests answer 409, the host view has no catalog, manual LeetCode slots still work", async () => {
    state.catalogOff = true;
    const created = await as(alice, () => api.create(roomId, { mode: "rating", problemCount: 2, external: 1, leetcodeAuto: true }));
    expect(created.status).toBe(409);
    expect((await json(created)).code).toBe("leetcode_catalog_unavailable");
    const lobby = await createLobby(alice, { mode: "rating", problemCount: 2, external: 1 });
    expect(lobby.lobby.leetcodeCatalog).toBeUndefined();
    const draw = await as(alice, () => api.draw(roomId, lobby.id, { leetcodeAuto: true }));
    expect(draw.status).toBe(409);
    expect((await json(draw)).code).toBe("leetcode_catalog_unavailable");
    expect((await as(alice, () => api.external(roomId, lobby.id, { action: "add", catalogSlug: "min-cost-climbing-stairs" }))).status).toBe(409);
    expect((await as(alice, () => api.search(roomId, lobby.id))).status).toBe(409);
    // As before: a pasted link fills the LeetCode slot and the session starts.
    expect((await as(alice, () => api.external(roomId, lobby.id, { action: "add", url: TWO_SUM }))).status).toBe(200);
    expect((await as(alice, () => api.start(roomId, lobby.id))).status).toBe(200);
  });

  it("a stored auto setting with the catalog off leaves the LeetCode slots for the host to fill", async () => {
    const lobby = await createLobby(alice, { mode: "rating", problemCount: 2, external: 1, leetcodeAuto: true });
    await getTestDb().delete(roomSessionProblems).where(and(eq(roomSessionProblems.sessionId, lobby.id), isNull(roomSessionProblems.problemId)));
    state.catalogOff = true;
    expect((await as(alice, () => api.draw(roomId, lobby.id, { challenge: "tough" }))).status).toBe(200);
    expect(await externalRows(lobby.id)).toHaveLength(0);
  });
});

async function judgedSolve(user: User, sessionId: string, position: number) {
  const [slot] = await getTestDb()
    .select()
    .from(roomSessionProblems)
    .where(and(eq(roomSessionProblems.sessionId, sessionId), eq(roomSessionProblems.position, position)));
  const slug = problems.find((p) => p.id === slot.problemId)!.slug;
  const sub = await json<{ id: string }>(await as(user, () => api.submit(slug, { language: "python", code: "pass", roomSessionId: sessionId })));
  await getTestDb().update(submissions).set({ status: "running", startedAt: new Date() }).where(eq(submissions.id, sub.id));
  await finalize(
    getTestDb(),
    sub.id,
    toFinalFields("submit", {
      status: "accepted",
      passedCount: 2,
      totalCount: 2,
      runtimeMs: 1,
      memoryKb: 1,
      failedTestIndex: null,
      failedCase: null,
      caseResults: [],
      stdout: "",
      error: null,
    }),
  );
}

describe("Elo (AC-LC-14)", () => {
  /** One rated session (2 of ours + `external` LeetCode), bob solves Problem 1, carol marks the LeetCode slot. */
  async function playRated(withLeetCode: boolean) {
    await resetTestDb();
    alice = await createUser({ username: "alice" });
    bob = await createUser({ username: "bob" });
    carol = await createUser({ username: "carol" });
    problems = [];
    for (const [i, [difficulty, authorRating]] of ([["easy", 1200], ["medium", 1600], ["hard", 2000]] as const).entries()) {
      const p = await createProblem({ difficulty, slug: `ours-${i + 1}`, title: `Ours ${i + 1}`, authorRating });
      await createTestCases(p.id, 2);
      problems.push(p);
    }
    const { room } = await createRoom({ owner: alice, members: [bob, carol], name: "Elo Club" });
    roomId = room.id;
    state.seed = 5;
    const body = withLeetCode
      ? { mode: "rating", problemCount: 3, external: 1, leetcodeAuto: true, durationMin: 60 }
      : { mode: "rating", problemCount: 2, durationMin: 60 };
    const lobby = await createLobby(alice, body);
    await as(bob, () => api.join(roomId, lobby.id));
    await as(carol, () => api.join(roomId, lobby.id));
    expect((await as(alice, () => api.start(roomId, lobby.id))).status).toBe(200);
    await shiftSessionWindow(lobby.id, new Date(Date.now() - 20 * MIN));
    await judgedSolve(bob, lobby.id, 1);
    await judgedSolve(carol, lobby.id, 1);
    if (withLeetCode) {
      const { POST: selfReportRoute } = await import("@/app/api/rooms/[roomId]/sessions/[sessionId]/slots/[position]/self-report/route");
      const res = await as(carol, () =>
        selfReportRoute(post(`${base(roomId, lobby.id)}/slots/3/self-report`, { solved: true }), params({ roomId, sessionId: lobby.id, position: "3" })),
      );
      expect(res.status).toBe(200);
    }
    expect((await as(alice, () => api.end(roomId, lobby.id))).status).toBe(200);
    const members = await getTestDb().select().from(roomMembers).where(eq(roomMembers.roomId, roomId));
    const results = (await getSessionResults(getTestDb(), roomId, lobby.id, alice.id)) as FinishedResults;
    return {
      ratings: Object.fromEntries(
        members.map((m) => [[alice, bob, carol].find((u) => u.id === m.userId)!.username, [m.rating, m.ratedPairs]]),
      ),
      internal: (await internalRows(lobby.id)).map((r) => r.difficulty),
      results,
    };
  }

  it("a rated session with auto LeetCode slots updates ratings exactly as one without them", async () => {
    const without = await playRated(false);
    const withLc = await playRated(true);
    expect(withLc.internal).toEqual(without.internal);
    expect(withLc.ratings).toEqual(without.ratings);
    const lcProblem = withLc.results.problems.find((p) => p.external)!;
    expect(lcProblem.external?.provenance).toMatchObject({ difficultyEstimated: true, ratingSource: "zerotrac" });
    expect(lcProblem.rating ?? null).toBeNull();
  });
});
