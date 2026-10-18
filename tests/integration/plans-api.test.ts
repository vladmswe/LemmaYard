// Study plans (community C2, docs/specs/community.md §B.8, AC-C-SP-1..7,
// AC-C-GEN-3/4) through the real route handlers and the test database:
// check order, the private / link / public authorization matrix, token
// guessing, items and sections with their limits, ordering, per-viewer
// progress, duplicate and save semantics, room → plan, the advisory-lock
// limits across two pools, the admin takedown and the query budgets.
// `next/headers` cookies() is a per-test cookie jar, as in the rooms tests.
import { randomBytes } from "node:crypto";

import { asc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/server/db";

const state = vi.hoisted(() => {
  process.env.PLANS_ENABLED = "1";
  return {
    db: undefined as Db | undefined,
    /** When set, getDb() alternates between these (two "instances"). */
    pools: [] as Db[],
    turn: 0,
    cookies: new Map<string, string>(),
  };
});

vi.mock("@/server/db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/db")>();
  return {
    ...mod,
    getDb: () => (state.pools.length > 0 ? state.pools[state.turn++ % state.pools.length] : state.db!),
  };
});

vi.mock("next/headers", () => ({
  cookies: () => {
    const jar = new Map(state.cookies);
    return Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    });
  },
}));

import { GET as getPlanRoute, PATCH as patchPlanRoute, DELETE as deletePlanRoute } from "@/app/api/plans/[id]/route";
import { POST as duplicateRoute } from "@/app/api/plans/[id]/duplicate/route";
import { PATCH as itemRoute, DELETE as deleteItemRoute } from "@/app/api/plans/[id]/items/[itemId]/route";
import { PUT as tickRoute } from "@/app/api/plans/[id]/items/[itemId]/tick/route";
import { POST as addItemsRoute, PATCH as layoutRoute } from "@/app/api/plans/[id]/items/route";
import { PUT as saveRoute } from "@/app/api/plans/[id]/save/route";
import { DELETE as deleteSectionRoute, PATCH as renameSectionRoute } from "@/app/api/plans/[id]/sections/[sectionId]/route";
import { POST as createSectionRoute } from "@/app/api/plans/[id]/sections/route";
import { POST as importRoute } from "@/app/api/plans/import/route";
import { GET as searchRoute } from "@/app/api/plans/problem-search/route";
import { GET as pickerRoute, POST as createRoute } from "@/app/api/plans/route";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { signSessionToken } from "@/server/auth/token";
import * as schema from "@/server/db/schema";
import { studyPlanItems, studyPlans, studyPlanSaves, studyPlanSections, studyPlanTicks } from "@/server/db/schema";
import { getEnv } from "@/server/env";
import { unpublishPlan } from "@/server/plans/admin";
import { PLAN_WRITES_PER_HOUR } from "@/server/plans/limits";
import { getPlanPage, listMyPlans, listPickerPlans, listPublicPlans } from "@/server/plans/read";

import {
  closeTestDb,
  createProblem,
  createSubmission,
  createUser,
  getTestDb,
  resetTestDb,
  testDbUrl,
} from "../helpers/db";
import { addRoomMember, createRoom, createRoomSession } from "../helpers/rooms";

const ORIGIN = new URL(getEnv().AUTH_URL).origin;
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

type User = Awaited<ReturnType<typeof createUser>>;
type Problem = Awaited<ReturnType<typeof createProblem>>;

function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
const get = (path: string) => new Request(`${ORIGIN}${path}`);
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

async function signIn(user: User | null) {
  state.cookies.clear();
  if (user) state.cookies.set(SESSION_COOKIE, await signSessionToken(user.id));
}
async function as<T>(user: User | null, fn: () => Promise<T>): Promise<T> {
  await signIn(user);
  return fn();
}

const api = {
  create: (body: unknown, h?: Record<string, string>) => createRoute(req("POST", "/api/plans", body, h)),
  picker: (problem?: string) => pickerRoute(get(`/api/plans${problem ? `?problem=${problem}` : ""}`)),
  get: (id: string, share?: string) =>
    getPlanRoute(get(`/api/plans/${id}${share ? `?share=${encodeURIComponent(share)}` : ""}`), params({ id })),
  patch: (id: string, body: unknown) => patchPlanRoute(req("PATCH", `/api/plans/${id}`, body), params({ id })),
  delete: (id: string) => deletePlanRoute(req("DELETE", `/api/plans/${id}`, {}), params({ id })),
  add: (id: string, body: unknown, h?: Record<string, string>) =>
    addItemsRoute(req("POST", `/api/plans/${id}/items`, body, h), params({ id })),
  layout: (id: string, body: unknown) => layoutRoute(req("PATCH", `/api/plans/${id}/items`, body), params({ id })),
  item: (id: string, itemId: string, body: unknown) =>
    itemRoute(req("PATCH", `/api/plans/${id}/items/${itemId}`, body), params({ id, itemId })),
  deleteItem: (id: string, itemId: string) =>
    deleteItemRoute(req("DELETE", `/api/plans/${id}/items/${itemId}`, {}), params({ id, itemId })),
  tick: (id: string, itemId: string, body: unknown) =>
    tickRoute(req("PUT", `/api/plans/${id}/items/${itemId}/tick`, body), params({ id, itemId })),
  section: (id: string, body: unknown) => createSectionRoute(req("POST", `/api/plans/${id}/sections`, body), params({ id })),
  renameSection: (id: string, sectionId: string, body: unknown) =>
    renameSectionRoute(req("PATCH", `/api/plans/${id}/sections/${sectionId}`, body), params({ id, sectionId })),
  deleteSection: (id: string, sectionId: string) =>
    deleteSectionRoute(req("DELETE", `/api/plans/${id}/sections/${sectionId}`, {}), params({ id, sectionId })),
  save: (id: string, body: unknown) => saveRoute(req("PUT", `/api/plans/${id}/save`, body), params({ id })),
  duplicate: (id: string, body: unknown = {}) => duplicateRoute(req("POST", `/api/plans/${id}/duplicate`, body), params({ id })),
  import: (body: unknown) => importRoute(req("POST", "/api/plans/import", body)),
  search: (q: string) => searchRoute(get(`/api/plans/problem-search?q=${encodeURIComponent(q)}`)),
};

/** Every row a plan route could write, for "rejected requests write nothing". */
async function snapshot() {
  const { rows } = await getTestDb().execute(sql`
    SELECT
      (SELECT coalesce(json_agg(p ORDER BY p.id), '[]') FROM study_plans p) AS plans,
      (SELECT coalesce(json_agg(s ORDER BY s.id), '[]') FROM study_plan_sections s) AS sections,
      (SELECT coalesce(json_agg(i ORDER BY i.id), '[]') FROM study_plan_items i) AS items,
      (SELECT coalesce(json_agg(t ORDER BY t.item_id, t.user_id), '[]') FROM study_plan_ticks t) AS ticks,
      (SELECT coalesce(json_agg(v ORDER BY v.plan_id, v.user_id), '[]') FROM study_plan_saves v) AS saves
  `);
  return JSON.stringify(rows[0]);
}

async function createPlanAs(user: User, body: Record<string, unknown> = {}): Promise<string> {
  const res = await as(user, () => api.create({ title: "Fall interview prep", ...body }));
  expect(res.status).toBe(201);
  return (await res.json()).id;
}

async function planRow(id: string) {
  const [row] = await getTestDb().select().from(studyPlans).where(eq(studyPlans.id, id));
  return row;
}

async function itemsOf(planId: string) {
  return getTestDb()
    .select()
    .from(studyPlanItems)
    .where(eq(studyPlanItems.planId, planId))
    .orderBy(asc(studyPlanItems.sectionId), asc(studyPlanItems.position));
}

let alice: User;
let bob: User;
let carol: User;
let twoSum: Problem;
let valid: Problem;
let climb: Problem;
let hidden: Problem;

beforeAll(() => {
  state.db = getTestDb();
});
beforeEach(async () => {
  state.pools = [];
  await resetTestDb();
  alice = await createUser({ username: "alice" });
  bob = await createUser({ username: "bob" });
  carol = await createUser({ username: "carol" });
  twoSum = await createProblem({ slug: "two-sum", title: "Two Sum", difficulty: "easy" });
  valid = await createProblem({ slug: "valid-parentheses", title: "Valid Parentheses", difficulty: "easy" });
  climb = await createProblem({ slug: "climbing-stairs", title: "Climbing Stairs", difficulty: "medium" });
  hidden = await createProblem({ slug: "hidden-one", title: "Hidden One", difficulty: "hard", published: false });
});
afterAll(closeTestDb);

describe("schema (AC-C-GEN-4)", () => {
  it("CHECKs reject what the app never writes", async () => {
    const db = getTestDb();
    const [plan] = await db.insert(studyPlans).values({ ownerId: alice.id, title: "P" }).returning();
    const bad = [
      db.insert(studyPlans).values({ ownerId: alice.id, title: "" }),
      db.insert(studyPlans).values({ ownerId: alice.id, title: "a\u0000b" }),
      db.insert(studyPlans).values({ ownerId: alice.id, title: "P", visibility: "unlisted" }),
      db.insert(studyPlans).values({ ownerId: alice.id, title: "P", shareToken: "short" }),
      db.insert(studyPlans).values({ ownerId: alice.id, title: "P", description: "tab\there" }),
      db.insert(studyPlanItems).values({ planId: plan.id, position: 0 }),
      db.insert(studyPlanItems).values({ planId: plan.id, position: 0, problemId: twoSum.id, externalSlug: "two-sum" }),
      db.insert(studyPlanItems).values({ planId: plan.id, position: 0, externalSlug: "https://evil.example/" }),
      db.insert(studyPlanItems).values({ planId: plan.id, position: 0, externalSlug: "Two-Sum" }),
      db.insert(studyPlanItems).values({ planId: plan.id, position: 0, problemId: twoSum.id, externalTitle: "x" }),
      db.insert(studyPlanItems).values({ planId: plan.id, position: -1, problemId: twoSum.id }),
    ];
    for (const query of bad) await expect(query).rejects.toThrow();
    // Newlines are fine in a description (plain text).
    await db.update(studyPlans).set({ description: "line 1\nline 2" }).where(eq(studyPlans.id, plan.id));
  });
});

describe("check order (AC-C-GEN-3)", () => {
  it("cross-origin 403 → guest 401 → too large 413 → invalid 400 → unknown 404 → not owner 403; nothing written", async () => {
    const planId = await createPlanAs(alice, { visibility: "public" });
    const before = await snapshot();
    expect((await as(alice, () => api.add(planId, { items: [{ problemSlug: "two-sum" }] }, { Origin: "https://evil.example" }))).status).toBe(403);
    expect((await as(alice, () => api.add(planId, { items: [{ problemSlug: "two-sum" }] }, { "Content-Type": "text/plain" }))).status).toBe(403);
    expect((await as(null, () => api.add(planId, { items: [{ problemSlug: "two-sum" }] }))).status).toBe(401);
    expect((await as(alice, () => api.add(planId, JSON.stringify({ items: [], pad: "x".repeat(40_000) })))).status).toBe(413);
    const invalid = await as(alice, () => api.add(planId, { items: [{ problemSlug: "two-sum" }], extra: 1 }));
    expect(invalid.status).toBe(400);
    expect((await as(alice, () => api.add(planId, { items: [{ leetcodeUrl: "https://evil.example/problems/x/" }] }))).status).toBe(400);
    expect((await as(alice, () => api.add(UNKNOWN_ID, { items: [{ problemSlug: "two-sum" }] }))).status).toBe(404);
    expect((await as(alice, () => api.add("not-a-uuid", { items: [{ problemSlug: "two-sum" }] }))).status).toBe(404);
    const notOwner = await as(bob, () => api.add(planId, { items: [{ problemSlug: "two-sum" }] }));
    expect(notOwner.status).toBe(403);
    expect(notOwner.headers.get("cache-control")).toBe("no-store");
    expect(await snapshot()).toBe(before);
  });
});

describe("plans CRUD and limits (AC-C-SP-1)", () => {
  it("creates a private plan, optionally with a first problem in a section", async () => {
    const res = await as(alice, () =>
      api.create({ title: "  Graphs   week ", items: [{ problemSlug: "two-sum" }], section: { title: "Week 1" } }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ added: 1, skipped: 0 });
    const plan = await planRow(body.id);
    expect(plan).toMatchObject({ title: "Graphs week", visibility: "private", shareToken: null, itemCount: 1, ownerId: alice.id });
    const [section] = await getTestDb().select().from(studyPlanSections).where(eq(studyPlanSections.planId, body.id));
    expect(section.title).toBe("Week 1");
    expect((await itemsOf(body.id))[0]).toMatchObject({ problemId: twoSum.id, sectionId: section.id, position: 0 });
  });

  it("a new plan whose first problem is unknown is not created at all", async () => {
    const before = await snapshot();
    const res = await as(alice, () => api.create({ title: "P", items: [{ problemSlug: "no-such-problem" }] }));
    expect(res.status).toBe(404);
    expect(await snapshot()).toBe(before);
  });

  it("the 51st plan → 409", async () => {
    await getTestDb()
      .insert(studyPlans)
      .values(Array.from({ length: 50 }, (_, i) => ({ ownerId: alice.id, title: `Plan ${i}` })));
    const res = await as(alice, () => api.create({ title: "One too many" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/at most 50/);
  });

  it("items: ours + LeetCode (slug only), duplicates skipped, unknown / unpublished problems 404", async () => {
    const planId = await createPlanAs(alice);
    const res = await as(alice, () =>
      api.add(planId, {
        items: [
          { problemSlug: "two-sum", note: "warm-up" },
          { leetcodeUrl: "http://leetcode.com/problems/Meeting-Rooms-II/description/?x=1", title: "Meeting Rooms II" },
          { problemSlug: "two-sum" },
          { leetcodeUrl: "https://www.leetcode.com/problems/meeting-rooms-ii/" },
        ],
      }),
    );
    expect(await res.json()).toEqual({ added: 2, skipped: 2 });
    const again = await as(alice, () => api.add(planId, { items: [{ problemSlug: "two-sum" }, { problemSlug: "climbing-stairs" }] }));
    expect(await again.json()).toEqual({ added: 1, skipped: 1 });
    const items = await itemsOf(planId);
    expect(items.map((i) => [i.problemId, i.externalSlug, i.externalTitle, i.note, i.position])).toEqual([
      [twoSum.id, null, null, "warm-up", 0],
      [null, "meeting-rooms-ii", "Meeting Rooms II", null, 1],
      [climb.id, null, null, null, 2],
    ]);
    expect((await planRow(planId)).itemCount).toBe(3);
    expect((await as(alice, () => api.add(planId, { items: [{ problemSlug: "hidden-one" }] }))).status).toBe(404);
    expect((await as(alice, () => api.add(planId, { items: [{ problemSlug: "nope" }] }))).status).toBe(404);
  });

  it("the 301st item → 409; the 21st section → 409", async () => {
    const planId = await createPlanAs(alice);
    await getTestDb()
      .insert(studyPlanItems)
      .values(Array.from({ length: 300 }, (_, i) => ({ planId, position: i, externalSlug: `p-${i}` })));
    await getTestDb().update(studyPlans).set({ itemCount: 300 }).where(eq(studyPlans.id, planId));
    const full = await as(alice, () => api.add(planId, { items: [{ problemSlug: "two-sum" }] }));
    expect(full.status).toBe(409);
    // A batch that only repeats problems already there is fine (nothing to add).
    expect((await (await as(alice, () => api.add(planId, { items: [{ leetcodeUrl: "https://leetcode.com/problems/p-1/" }] }))).json())).toEqual({
      added: 0,
      skipped: 1,
    });

    const other = await createPlanAs(alice);
    await getTestDb()
      .insert(studyPlanSections)
      .values(Array.from({ length: 20 }, (_, i) => ({ planId: other, position: i, title: `S${i}` })));
    expect((await as(alice, () => api.section(other, { title: "S20" }))).status).toBe(409);
    // By name: an existing section (case-insensitive) is reused, a new one cannot be created.
    expect((await as(alice, () => api.add(other, { items: [{ problemSlug: "two-sum" }], section: { title: "s3" } }))).status).toBe(200);
    expect((await as(alice, () => api.add(other, { items: [{ problemSlug: "valid-parentheses" }], section: { title: "New" } }))).status).toBe(409);
  });

  it("owner edits title, description, visibility; reset link rotates the token; delete removes everything", async () => {
    const planId = await createPlanAs(alice);
    const res = await as(alice, () => api.patch(planId, { title: "Renamed", description: "Line 1\r\nLine 2", visibility: "unlisted" }));
    const body = await res.json();
    expect(body.visibility).toBe("unlisted");
    expect(body.shareToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await planRow(planId)).toMatchObject({ title: "Renamed", description: "Line 1\nLine 2", shareToken: body.shareToken });
    const reset = await (await as(alice, () => api.patch(planId, { resetShareLink: true }))).json();
    expect(reset.shareToken).not.toBe(body.shareToken);
    // Private again: the token stays, so the link comes back with "anyone with the link".
    expect((await (await as(alice, () => api.patch(planId, { visibility: "private" }))).json()).shareToken).toBe(reset.shareToken);
    expect((await as(alice, () => api.patch(planId, { description: "" }))).status).toBe(200);
    expect((await planRow(planId)).description).toBeNull();

    await as(alice, () => api.add(planId, { items: [{ problemSlug: "two-sum" }] }));
    expect((await as(bob, () => api.delete(planId))).status).toBe(404);
    expect((await as(alice, () => api.delete(planId))).status).toBe(200);
    expect(await planRow(planId)).toBeUndefined();
    expect(await itemsOf(planId)).toEqual([]);
  });

  it("item notes and external titles; removing an item updates the count", async () => {
    const planId = await createPlanAs(alice);
    await as(alice, () => api.add(planId, { items: [{ problemSlug: "two-sum" }, { leetcodeUrl: "https://leetcode.com/problems/lru-cache/" }] }));
    const [ours, ext] = await itemsOf(planId);
    expect((await as(alice, () => api.item(planId, ours.id, { note: "use a hash map" }))).status).toBe(200);
    expect((await as(alice, () => api.item(planId, ours.id, { title: "x" }))).status).toBe(400);
    expect((await as(alice, () => api.item(planId, ext.id, { title: "LRU Cache" }))).status).toBe(200);
    expect((await as(alice, () => api.item(planId, UNKNOWN_ID, { note: "x" }))).status).toBe(404);
    expect((await as(bob, () => api.item(planId, ours.id, { note: "mine now" }))).status).toBe(404);
    const after = await itemsOf(planId);
    expect(after.map((i) => [i.note, i.externalTitle])).toEqual([
      ["use a hash map", null],
      [null, "LRU Cache"],
    ]);
    expect((await as(alice, () => api.deleteItem(planId, ours.id))).status).toBe(200);
    expect((await planRow(planId)).itemCount).toBe(1);
  });
});

describe("ordering (Move up / Move down)", () => {
  it("applies a full layout, rejects stale or foreign ones, and deleting a section keeps its items", async () => {
    const planId = await createPlanAs(alice);
    await as(alice, () => api.add(planId, { items: [{ problemSlug: "two-sum" }, { problemSlug: "valid-parentheses" }] }));
    const s1 = (await (await as(alice, () => api.section(planId, { title: "Dynamic programming" }))).json()).id;
    const s2 = (await (await as(alice, () => api.section(planId, { title: "Extra" }))).json()).id;
    await as(alice, () => api.add(planId, { items: [{ problemSlug: "climbing-stairs" }], section: { id: s1 } }));
    const [a, b] = (await itemsOf(planId)).filter((i) => i.sectionId === null);
    const c = (await itemsOf(planId)).find((i) => i.sectionId === s1)!;

    // b moves into s2, c to the top, sections swap.
    const layout = { unsectioned: [c.id, a.id], sections: [{ id: s2, items: [b.id] }, { id: s1, items: [] }] };
    expect((await as(alice, () => api.layout(planId, layout))).status).toBe(200);
    const page = (await getPlanPage(getTestDb(), planId, alice.id, null))!;
    expect(page.unsectioned.map((i) => i.id)).toEqual([c.id, a.id]);
    expect(page.sections.map((s) => [s.title, s.items.map((i) => i.id)])).toEqual([
      ["Extra", [b.id]],
      ["Dynamic programming", []],
    ]);

    const before = await snapshot();
    const stale = { unsectioned: [c.id], sections: [{ id: s2, items: [b.id] }, { id: s1, items: [] }] };
    expect((await as(alice, () => api.layout(planId, stale))).status).toBe(409);
    const foreign = { ...layout, unsectioned: [c.id, a.id, UNKNOWN_ID] };
    expect((await as(alice, () => api.layout(planId, foreign))).status).toBe(409);
    expect((await as(bob, () => api.layout(planId, layout))).status).toBe(404);
    expect(await snapshot()).toBe(before);

    expect((await as(alice, () => api.renameSection(planId, s2, { title: "Bonus" }))).status).toBe(200);
    expect((await as(alice, () => api.deleteSection(planId, s2))).status).toBe(200);
    const after = (await getPlanPage(getTestDb(), planId, alice.id, null))!;
    expect(after.unsectioned.map((i) => i.id)).toEqual([c.id, a.id, b.id]);
    expect(after.sections.map((s) => s.title)).toEqual(["Dynamic programming"]);
  });
});

describe("visibility and share links (AC-C-SP-2)", () => {
  async function shared(visibility: "private" | "unlisted" | "public") {
    const planId = await createPlanAs(alice, { items: [{ problemSlug: "two-sum" }] });
    const body = await (await as(alice, () => api.patch(planId, { visibility }))).json();
    return { planId, token: body.shareToken as string | null };
  }

  it("private: 404 for everyone but the owner (API and page data), never 403", async () => {
    const { planId } = await shared("private");
    expect((await as(alice, () => api.get(planId))).status).toBe(200);
    for (const viewer of [bob, null]) {
      const res = await as(viewer, () => api.get(planId));
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Study plan not found" });
      expect(await getPlanPage(getTestDb(), planId, viewer?.id ?? null, null)).toBeNull();
    }
    // Unknown and malformed ids look the same.
    expect(await (await as(bob, () => api.get(UNKNOWN_ID))).json()).toEqual({ error: "Study plan not found" });
    expect((await as(bob, () => api.get("../etc"))).status).toBe(404);
  });

  it("unlisted: readable with the token (guests too), 404 without it or with a guessed one", async () => {
    const { planId, token } = await shared("unlisted");
    expect((await as(null, () => api.get(planId, token!))).status).toBe(200);
    expect((await as(bob, () => api.get(planId, token!))).status).toBe(200);
    expect((await as(bob, () => api.get(planId))).status).toBe(404);
    // Token guessing: random well-formed tokens, near misses, other plans' tokens, junk.
    const { token: otherToken } = await shared("unlisted");
    const guesses = [
      ...Array.from({ length: 50 }, () => randomBytes(32).toString("base64url")),
      `${token!.slice(0, -1)}${token!.endsWith("A") ? "B" : "A"}`,
      token!.toLowerCase() === token ? token!.toUpperCase() : token!.toLowerCase(),
      otherToken!,
      `${token}x`,
      token!.slice(1),
      "",
      "%00",
      "' OR 1=1 --",
    ];
    for (const guess of guesses) {
      expect((await as(bob, () => api.get(planId, guess))).status).toBe(404);
    }
    // Reset: the old link stops working.
    const fresh = (await (await as(alice, () => api.patch(planId, { resetShareLink: true }))).json()).shareToken;
    expect((await as(bob, () => api.get(planId, token!))).status).toBe(404);
    expect((await as(bob, () => api.get(planId, fresh))).status).toBe(200);
    // Private again: even the right token is 404.
    await as(alice, () => api.patch(planId, { visibility: "private" }));
    expect((await as(bob, () => api.get(planId, fresh))).status).toBe(404);
  });

  it("public: anyone reads; non-owners cannot write (403), and never see the token", async () => {
    const { planId } = await shared("public");
    const page = await (await as(null, () => api.get(planId))).json();
    expect(page.plan.ownerUsername).toBe("alice");
    expect(page.shareToken).toBeNull();
    expect(page.viewer).toEqual({ signedIn: false, isOwner: false, saved: false, share: null });
    const before = await snapshot();
    expect((await as(bob, () => api.patch(planId, { title: "Mine" }))).status).toBe(403);
    expect((await as(bob, () => api.delete(planId))).status).toBe(403);
    expect((await as(bob, () => api.section(planId, { title: "x" }))).status).toBe(403);
    expect(await snapshot()).toBe(before);
  });

  it("the public list shows public plans only, searchable by title (LIKE wildcards are literal)", async () => {
    const pub = await createPlanAs(alice, { title: "Graphs 100% done", visibility: "public" });
    await createPlanAs(alice, { title: "Graphs private" });
    await createPlanAs(bob, { title: "Graphs link", visibility: "unlisted" });
    const all = await listPublicPlans(getTestDb(), { q: "", sort: "popular", page: 1 });
    expect(all.plans.map((p) => p.id)).toEqual([pub]);
    expect((await listPublicPlans(getTestDb(), { q: "100%", sort: "new", page: 1 })).total).toBe(1);
    expect((await listPublicPlans(getTestDb(), { q: "_", sort: "new", page: 1 })).total).toBe(0);
    await unpublishPlan(getTestDb(), pub);
    expect((await listPublicPlans(getTestDb(), { q: "", sort: "popular", page: 1 })).total).toBe(0);
  });
});

describe("progress per viewer (AC-C-SP-3)", () => {
  it("follows the viewer's submits and ticks; the owner's progress never leaks", async () => {
    const planId = await createPlanAs(alice, {
      visibility: "public",
      items: [{ problemSlug: "two-sum" }, { problemSlug: "valid-parentheses" }, { leetcodeUrl: "https://leetcode.com/problems/lru-cache/" }],
    });
    // A problem unpublished later stays listed but counts nowhere.
    await getTestDb().insert(studyPlanItems).values({ planId, position: 9, problemId: hidden.id });
    const ext = (await itemsOf(planId)).find((i) => i.externalSlug)!;

    // Alice (owner): solved two-sum, ticked the external one.
    await createSubmission({ userId: alice.id, problemId: twoSum.id, status: "accepted", finishedAt: new Date() });
    expect((await as(alice, () => api.tick(planId, ext.id, { done: true }))).status).toBe(200);
    // Bob: attempted valid-parentheses twice (wrong), a Run that does not count, a solved hidden problem.
    await createSubmission({ userId: bob.id, problemId: valid.id, status: "wrong_answer", finishedAt: new Date() });
    await createSubmission({ userId: bob.id, problemId: valid.id, status: "runtime_error", finishedAt: new Date() });
    await createSubmission({ userId: bob.id, problemId: twoSum.id, kind: "run", status: "accepted", finishedAt: new Date() });
    await createSubmission({ userId: bob.id, problemId: hidden.id, status: "accepted", finishedAt: new Date() });

    const forAlice = (await getPlanPage(getTestDb(), planId, alice.id, null))!;
    expect(forAlice.progress).toMatchObject({ done: 2, total: 3, nextItemId: forAlice.unsectioned[1].id });

    const bobView = await (await as(bob, () => api.get(planId))).json();
    const states = bobView.unsectioned.map((i: { state: unknown }) => i.state);
    expect(states).toEqual([
      { kind: "problem", status: "todo", solvedAt: null, wrongCount: 0 },
      { kind: "problem", status: "attempted", solvedAt: null, wrongCount: 2 },
      { kind: "external", done: false },
      { kind: "unavailable" },
    ]);
    expect(bobView.progress).toEqual({
      done: 0,
      total: 3,
      byDifficulty: { easy: { done: 0, total: 2 }, medium: { done: 0, total: 0 }, hard: { done: 0, total: 0 } },
      external: { done: 0, total: 1 },
      nextItemId: bobView.unsectioned[0].id,
    });
    expect(JSON.stringify(bobView)).not.toContain(alice.id);

    // Bob ticks his own copy of the external item; Alice's tick is untouched.
    expect((await as(bob, () => api.tick(planId, ext.id, { done: true }))).status).toBe(200);
    expect((await as(bob, () => api.tick(planId, ext.id, { done: false }))).status).toBe(200);
    expect((await as(bob, () => api.tick(planId, ext.id, { done: true }))).status).toBe(200);
    const ticks = await getTestDb().select().from(studyPlanTicks).orderBy(asc(studyPlanTicks.userId));
    expect(ticks.map((t) => t.userId).sort()).toEqual([alice.id, bob.id].sort());
    // Our problems are done by an accepted submit, not by a tick.
    expect((await as(bob, () => api.tick(planId, forAlice.unsectioned[0].id, { done: true }))).status).toBe(409);
    expect((await as(null, () => api.tick(planId, ext.id, { done: true }))).status).toBe(401);

    // The list cards count the same way.
    const cards = await listMyPlans(getTestDb(), alice.id);
    expect(cards.mine[0]).toMatchObject({ done: 2, total: 3 });
  });

  it("ticks on an unlisted plan need its token", async () => {
    const planId = await createPlanAs(alice, { visibility: "unlisted", items: [{ leetcodeUrl: "https://leetcode.com/problems/lru-cache/" }] });
    const token = (await planRow(planId)).shareToken!;
    const [ext] = await itemsOf(planId);
    expect((await as(bob, () => api.tick(planId, ext.id, { done: true }))).status).toBe(404);
    expect((await as(bob, () => api.tick(planId, ext.id, { done: true, share: randomBytes(32).toString("base64url") }))).status).toBe(404);
    expect((await as(bob, () => api.tick(planId, ext.id, { done: true, share: token }))).status).toBe(200);
  });
});

describe("duplicate and save (AC-C-SP-5)", () => {
  it("duplicates a public plan into a private copy with sections, items and notes, not ticks", async () => {
    const planId = await createPlanAs(alice, {
      visibility: "public",
      description: "Read me",
      items: [{ problemSlug: "two-sum", note: "start here" }],
    });
    await as(alice, () =>
      api.add(planId, { items: [{ leetcodeUrl: "https://leetcode.com/problems/lru-cache/", title: "LRU" }], section: { title: "Design" } }),
    );
    const ext = (await itemsOf(planId)).find((i) => i.externalSlug)!;
    await as(alice, () => api.tick(planId, ext.id, { done: true }));

    const res = await as(bob, () => api.duplicate(planId));
    expect(res.status).toBe(201);
    const copyId = (await res.json()).id;
    expect(await planRow(copyId)).toMatchObject({
      ownerId: bob.id,
      title: "Fall interview prep",
      description: "Read me",
      visibility: "private",
      source: "clone",
      forkedFromId: planId,
      itemCount: 2,
    });
    const copy = (await getPlanPage(getTestDb(), copyId, bob.id, null))!;
    expect(copy.plan.forkedFrom).toEqual({ id: planId, title: "Fall interview prep", ownerUsername: "alice" });
    expect(copy.unsectioned.map((i) => i.note)).toEqual(["start here"]);
    expect(copy.sections.map((s) => [s.title, s.items.map((i) => (i.kind === "external" ? i.external.title : null))])).toEqual([["Design", ["LRU"]]]);
    expect(copy.sections[0].id).not.toBe((await getTestDb().select().from(studyPlanSections).where(eq(studyPlanSections.planId, planId)))[0].id);
    expect(copy.progress).toMatchObject({ done: 0 });

    // The credit disappears when the source is no longer public.
    await as(alice, () => api.patch(planId, { visibility: "private" }));
    expect((await getPlanPage(getTestDb(), copyId, bob.id, null))!.plan.forkedFrom).toBeNull();
    // A private plan of someone else cannot be duplicated (404); an unlisted one needs its token.
    expect((await as(bob, () => api.duplicate(planId))).status).toBe(404);
    const token = (await (await as(alice, () => api.patch(planId, { visibility: "unlisted" }))).json()).shareToken;
    expect((await as(bob, () => api.duplicate(planId))).status).toBe(404);
    expect((await as(bob, () => api.duplicate(planId, { share: token }))).status).toBe(201);
    // Deleting the source keeps the copies.
    await as(alice, () => api.delete(planId));
    expect((await planRow(copyId)).forkedFromId).toBeNull();
  });

  it("save / unsave; a saved plan that goes private or gets a new link disappears from Saved", async () => {
    const pub = await createPlanAs(alice, { visibility: "public" });
    expect((await as(alice, () => api.save(pub, { saved: true }))).status).toBe(409);
    expect((await as(bob, () => api.save(pub, { saved: true }))).status).toBe(200);
    expect((await as(bob, () => api.save(pub, { saved: true }))).status).toBe(200);
    expect((await planRow(pub)).saveCount).toBe(1);
    expect((await listMyPlans(getTestDb(), bob.id)).saved.map((p) => p.id)).toEqual([pub]);
    await as(alice, () => api.patch(pub, { visibility: "private" }));
    expect((await listMyPlans(getTestDb(), bob.id)).saved).toEqual([]);
    expect((await as(bob, () => api.save(pub, { saved: false }))).status).toBe(404);

    const link = await createPlanAs(alice, { visibility: "unlisted" });
    const token = (await planRow(link)).shareToken!;
    expect((await as(carol, () => api.save(link, { saved: true }))).status).toBe(404);
    expect((await as(carol, () => api.save(link, { saved: true, share: token }))).status).toBe(200);
    const saved = (await listMyPlans(getTestDb(), carol.id)).saved;
    expect(saved.map((p) => [p.id, p.share])).toEqual([[link, token]]);
    await as(alice, () => api.patch(link, { resetShareLink: true }));
    expect((await listMyPlans(getTestDb(), carol.id)).saved).toEqual([]);
    expect((await getTestDb().select().from(studyPlanSaves)).length).toBe(2); // rows stay; only listing hides them

    await as(alice, () => api.patch(pub, { visibility: "public" }));
    expect((await as(bob, () => api.save(pub, { saved: false }))).status).toBe(200);
    expect((await planRow(pub)).saveCount).toBe(0);
  });
});

describe("room session → plan (AC-C-SP-6)", () => {
  it("members of a finished session get a private plan with its problems in order; again → the same plan", async () => {
    const { room } = await createRoom({ owner: alice, name: "Saturday Club", members: [bob] });
    const session = await createRoomSession({
      roomId: room.id,
      status: "finished",
      startedAt: new Date("2026-10-17T15:00:00Z"),
      problems: [
        { problemId: climb.id, difficulty: "medium" },
        { problemId: twoSum.id, difficulty: "easy" },
        { problemId: valid.id, difficulty: "easy" },
      ],
    });
    const res = await as(bob, () => api.import({ source: "room_session", sessionId: session.id }));
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect(await planRow(id)).toMatchObject({
      ownerId: bob.id,
      title: "Saturday Club · Oct 17, 2026",
      visibility: "private",
      source: "room_session",
      sourceId: session.id,
      itemCount: 3,
    });
    expect((await itemsOf(id)).map((i) => i.problemId)).toEqual([climb.id, twoSum.id, valid.id]);
    const again = await as(bob, () => api.import({ source: "room_session", sessionId: session.id }));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ id, existing: true });
    // Alice gets her own plan.
    expect((await as(alice, () => api.import({ source: "room_session", sessionId: session.id }))).status).toBe(201);
  });

  it("non-member → 404; lobby, live and cancelled → 409; nothing written", async () => {
    const { room } = await createRoom({ owner: alice });
    await addRoomMember(room.id, bob.id);
    const finished = await createRoomSession({ roomId: room.id, status: "finished", problems: [{ problemId: twoSum.id, difficulty: "easy" }] });
    const before = await snapshot();
    expect((await as(carol, () => api.import({ source: "room_session", sessionId: finished.id }))).status).toBe(404);
    expect((await as(bob, () => api.import({ source: "room_session", sessionId: UNKNOWN_ID }))).status).toBe(404);
    expect((await as(bob, () => api.import({ source: "post", sessionId: finished.id }))).status).toBe(400);
    await getTestDb().execute(sql`UPDATE room_sessions SET status = 'cancelled', started_at = NULL, ends_at = NULL, end_reason = 'cancelled' WHERE id = ${finished.id}`);
    expect((await as(bob, () => api.import({ source: "room_session", sessionId: finished.id }))).status).toBe(409);
    for (const status of ["lobby", "live"] as const) {
      const { room: r } = await createRoom({ owner: alice, members: [bob] });
      const open = await createRoomSession({ roomId: r.id, status, problems: [{ problemId: twoSum.id, difficulty: "easy" }] });
      expect((await as(bob, () => api.import({ source: "room_session", sessionId: open.id }))).status).toBe(409);
    }
    expect(await snapshot()).toBe(before);
  });
});

describe("dialog and editor helpers", () => {
  it("picker lists my plans, marks the ones holding the problem, with their sections", async () => {
    const a = await createPlanAs(alice, { title: "A", items: [{ problemSlug: "two-sum" }], section: { title: "Arrays" } });
    await createPlanAs(alice, { title: "B" });
    await createPlanAs(bob, { title: "Not mine" });
    const res = await as(alice, () => api.picker("two-sum"));
    const { plans } = await res.json();
    expect(plans.map((p: { title: string; hasProblem: boolean; sectionTitles: string[] }) => [p.title, p.hasProblem, p.sectionTitles]).sort()).toEqual([
      ["A", true, ["Arrays"]],
      ["B", false, []],
    ]);
    expect(plans.find((p: { id: string }) => p.id === a).itemCount).toBe(1);
    expect((await as(null, () => api.picker())).status).toBe(401);
  });

  it("problem search: published only, by title / slug / number, wildcards literal", async () => {
    const hits = async (q: string) =>
      (await (await as(alice, () => api.search(q))).json()).problems.map((p: { slug: string }) => p.slug);
    expect(await hits("two")).toEqual(["two-sum"]);
    expect(await hits("climbing-stairs")).toEqual(["climbing-stairs"]);
    expect(await hits(String(twoSum.number))).toEqual(["two-sum"]);
    expect(await hits("hidden")).toEqual([]);
    expect(await hits("%")).toEqual([]);
    expect((await as(null, () => api.search("two"))).status).toBe(401);
  });
});

describe("rate limits and locks (§B.11, C.7)", () => {
  it("the hourly write budget answers 429 with Retry-After and writes nothing", async () => {
    // Make bob "established" (old account with an accepted submit) to get the higher budget.
    await getTestDb().execute(sql`UPDATE users SET created_at = now() - interval '10 days' WHERE id = ${bob.id}`);
    await createSubmission({ userId: bob.id, problemId: twoSum.id, status: "accepted", finishedAt: new Date() });
    for (const [user, limit] of [
      [alice, PLAN_WRITES_PER_HOUR.new],
      [bob, PLAN_WRITES_PER_HOUR.established],
    ] as const) {
      const [plan] = await getTestDb().insert(studyPlans).values({ ownerId: user.id, title: "Busy" }).returning();
      // limit − 1 recent section creations + the plan itself = the whole budget.
      await getTestDb()
        .insert(studyPlanSections)
        .values(Array.from({ length: limit - 1 }, (_, i) => ({ planId: plan.id, position: i, title: `S${i}` })));
      const before = await snapshot();
      const res = await as(user, () => api.create({ title: "One more" }));
      expect(res.status).toBe(429);
      const retry = Number(res.headers.get("retry-after"));
      expect(retry).toBeGreaterThan(3500);
      expect(retry).toBeLessThanOrEqual(3600);
      expect(await snapshot()).toBe(before);
    }
  });

  it("an item batch counts once, however many items it has", async () => {
    const planId = await createPlanAs(alice);
    await as(alice, () =>
      api.add(planId, { items: Array.from({ length: 40 }, (_, i) => ({ leetcodeUrl: `https://leetcode.com/problems/p-${i}/` })) }),
    );
    const { rows } = await getTestDb().execute<{ n: number }>(
      sql`SELECT count(DISTINCT created_at)::int AS n FROM study_plan_items WHERE plan_id = ${planId}`,
    );
    expect(rows[0].n).toBe(1);
  });

  it("20 concurrent creates over two pools (two instances) never pass the 50-plan limit", async () => {
    const pools = [new Pool({ connectionString: testDbUrl(), max: 10 }), new Pool({ connectionString: testDbUrl(), max: 10 })];
    try {
      state.pools = pools.map((p) => drizzle(p, { schema }));
      await getTestDb()
        .insert(studyPlans)
        .values(Array.from({ length: 45 }, (_, i) => ({ ownerId: alice.id, title: `Old ${i}`, createdAt: new Date(Date.now() - 7_200_000) })));
      await signIn(alice);
      const results = await Promise.all(Array.from({ length: 20 }, (_, i) => api.create({ title: `New ${i}` })));
      const statuses = results.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 201)).toHaveLength(5);
      expect(statuses.filter((s) => s === 409)).toHaveLength(15);
      const [{ n }] = await getTestDb()
        .select({ n: sql<number>`count(*)::int` })
        .from(studyPlans)
        .where(eq(studyPlans.ownerId, alice.id));
      expect(n).toBe(50);
    } finally {
      state.pools = [];
      await Promise.all(pools.map((p) => p.end()));
    }
  });

  it("concurrent batches into one plan never pass 300 items and keep item_count exact", async () => {
    const planId = await createPlanAs(alice);
    await getTestDb()
      .insert(studyPlanItems)
      .values(Array.from({ length: 290 }, (_, i) => ({ planId, position: i, externalSlug: `old-${i}` })));
    await getTestDb().update(studyPlans).set({ itemCount: 290 }).where(eq(studyPlans.id, planId));
    const pools = [new Pool({ connectionString: testDbUrl(), max: 5 }), new Pool({ connectionString: testDbUrl(), max: 5 })];
    try {
      state.pools = pools.map((p) => drizzle(p, { schema }));
      await signIn(alice);
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, k) =>
          api.add(planId, { items: Array.from({ length: 4 }, (_, i) => ({ leetcodeUrl: `https://leetcode.com/problems/new-${k}-${i}/` })) }),
        ),
      );
      expect(results.filter((r) => r.status === 200)).toHaveLength(2);
      expect(results.filter((r) => r.status === 409)).toHaveLength(4);
    } finally {
      state.pools = [];
      await Promise.all(pools.map((p) => p.end()));
    }
    const items = await itemsOf(planId);
    expect(items).toHaveLength(298);
    expect((await planRow(planId)).itemCount).toBe(298);
    expect(new Set(items.map((i) => i.position)).size).toBe(298);
  });
});

describe("admin takedown (pnpm plans:unpublish)", () => {
  it("makes a plan private and kills its link", async () => {
    const planId = await createPlanAs(alice, { visibility: "unlisted" });
    const token = (await planRow(planId)).shareToken!;
    expect(await unpublishPlan(getTestDb(), planId)).toEqual({ previous: "unlisted" });
    expect(await planRow(planId)).toMatchObject({ visibility: "private", shareToken: null });
    expect((await as(bob, () => api.get(planId, token))).status).toBe(404);
    expect(await unpublishPlan(getTestDb(), UNKNOWN_ID)).toBeNull();
    expect(await unpublishPlan(getTestDb(), "nope")).toBeNull();
  });
});

describe("query budgets (AC-C-SP-7)", () => {
  let pool: Pool;
  let logged: string[];
  let loggingDb: Db;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDbUrl() });
    loggingDb = drizzle(pool, { schema, logger: { logQuery: (q) => logged.push(q) } });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("the plan page uses ≤ 4 queries for 300 items (3 for guests); lists 1–2", async () => {
    const planId = await createPlanAs(alice, { visibility: "public" });
    const sections = await getTestDb()
      .insert(studyPlanSections)
      .values(Array.from({ length: 20 }, (_, i) => ({ planId, position: i, title: `Week ${i}` })))
      .returning();
    const problemsForPlan = [twoSum, valid, climb];
    await getTestDb()
      .insert(studyPlanItems)
      .values(
        Array.from({ length: 300 }, (_, i) =>
          i < 3
            ? { planId, position: i, problemId: problemsForPlan[i].id }
            : { planId, position: i, sectionId: sections[i % 20].id, externalSlug: `p-${i}` },
        ),
      );
    await getTestDb().update(studyPlans).set({ itemCount: 300 }).where(eq(studyPlans.id, planId));
    await createSubmission({ userId: bob.id, problemId: twoSum.id, status: "accepted", finishedAt: new Date() });

    logged = [];
    const page = await getPlanPage(loggingDb, planId, bob.id, null);
    expect(page!.unsectioned.length + page!.sections.reduce((n, s) => n + s.items.length, 0)).toBe(300);
    expect(logged.length).toBeLessThanOrEqual(4);

    logged = [];
    await getPlanPage(loggingDb, planId, null, null);
    expect(logged.length).toBeLessThanOrEqual(3);

    logged = [];
    await listMyPlans(loggingDb, alice.id);
    expect(logged.length).toBe(2);
    logged = [];
    await listPublicPlans(loggingDb, { q: "", sort: "popular", page: 1 });
    expect(logged.length).toBe(1);
    logged = [];
    await listPickerPlans(loggingDb, alice.id, "two-sum");
    expect(logged.length).toBe(1);
  });
});

describe("plan page data never exposes other users' data", () => {
  it("a reader's JSON has no owner id, no token of a public plan, no other viewer's ticks", async () => {
    const planId = await createPlanAs(alice, { visibility: "public", items: [{ leetcodeUrl: "https://leetcode.com/problems/lru-cache/" }] });
    await as(alice, () => api.patch(planId, { visibility: "unlisted" }));
    const token = (await planRow(planId)).shareToken!;
    await as(alice, () => api.patch(planId, { visibility: "public" }));
    const [ext] = await itemsOf(planId);
    await as(alice, () => api.tick(planId, ext.id, { done: true }));
    const text = await (await as(bob, () => api.get(planId))).text();
    expect(text).not.toContain(alice.id);
    expect(text).not.toContain(token);
    expect(JSON.parse(text).unsectioned[0].state).toEqual({ kind: "external", done: false });
    // Opening a public plan WITH its link token still never reveals the owner's token beyond what the viewer sent.
    const withToken = await (await as(bob, () => api.get(planId, token))).json();
    expect(withToken.shareToken).toBeNull();
    expect(withToken.viewer.share).toBe(token);
  });
});
