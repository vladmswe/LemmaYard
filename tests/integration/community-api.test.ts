// Community C1 through the real route handlers and the test database
// (docs/specs/community.md §B.16). `next/headers` cookies() is a per-test
// cookie jar; the community flags are a mutable mock so each test can switch
// COMMUNITY_ENABLED / COMMUNITY_READ_ONLY.
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/server/db";

const state = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  cookies: new Map<string, string>(),
  flags: { enabled: true, readOnly: false, contactEmail: null as string | null },
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

vi.mock("@/server/community/flags", () => ({
  communityFlags: () => ({ ...state.flags }),
  isCommunityEnabled: () => state.flags.enabled,
  requireCommunityPage: () => ({ ...state.flags }),
}));

import { DELETE as deleteRoute, GET as getRoute, PATCH as patchRoute } from "@/app/api/comments/[id]/route";
import { GET as repliesRoute } from "@/app/api/comments/[id]/replies/route";
import { PUT as voteRoute } from "@/app/api/comments/[id]/vote/route";
import { GET as listRoute, POST as createRoute } from "@/app/api/comments/route";
import { POST as modRoute } from "@/app/api/mod/actions/route";
import { PUT as feedbackRoute } from "@/app/api/problems/[slug]/difficulty-feedback/route";
import { POST as submitRoute } from "@/app/api/problems/[slug]/submit/route";
import { PUT as problemVoteRoute } from "@/app/api/problems/[slug]/vote/route";
import { POST as reportRoute } from "@/app/api/reports/route";
import type { CommentPage, CommentView } from "@/lib/community/dto";
import { wilsonLowerBound } from "@/lib/community/ranking";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { signSessionToken } from "@/server/auth/token";
import { counterDrift } from "@/server/community/recount";
import { getProblemSummary } from "@/server/community/threads";
import {
  commentVotes,
  comments,
  contentRevisions,
  discussionThreads,
  moderationActions,
  problemDifficultyFeedback,
  problems,
  problemVotes,
  reports,
  roomMembers,
} from "@/server/db/schema";
import { getEnv } from "@/server/env";

import { insertComment, newUser, oldUnsolvedUser, trustedUser, withRole } from "../helpers/community";
import { closeTestDb, createProblem, createTestCases, createUser, getTestDb, resetTestDb } from "../helpers/db";
import { createRoom } from "../helpers/rooms";

const ORIGIN = new URL(getEnv().AUTH_URL).origin;
const UNKNOWN = "00000000-0000-4000-8000-000000000000";
const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

type User = Awaited<ReturnType<typeof createUser>>;
type Problem = Awaited<ReturnType<typeof createProblem>>;
type H = Record<string, string>;

function req(method: string, path: string, body?: unknown, headers: H = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

const api = {
  list: (slug: string, query = "") => listRoute(new Request(`${ORIGIN}/api/comments?target=problem:${slug}${query}`)),
  create: (body: unknown, h?: H) => createRoute(req("POST", "/api/comments", body, h)),
  get: (id: string, reveal = false) =>
    getRoute(new Request(`${ORIGIN}/api/comments/${id}${reveal ? "?reveal=1" : ""}`), params({ id })),
  edit: (id: string, body: unknown, h?: H) => patchRoute(req("PATCH", `/api/comments/${id}`, body, h), params({ id })),
  del: (id: string, body: unknown = {}, h?: H) => deleteRoute(req("DELETE", `/api/comments/${id}`, body, h), params({ id })),
  replies: (id: string, query = "") =>
    repliesRoute(new Request(`${ORIGIN}/api/comments/${id}/replies${query}`), params({ id })),
  vote: (id: string, body: unknown, h?: H) => voteRoute(req("PUT", `/api/comments/${id}/vote`, body, h), params({ id })),
  problemVote: (slug: string, body: unknown, h?: H) =>
    problemVoteRoute(req("PUT", `/api/problems/${slug}/vote`, body, h), params({ slug })),
  feedback: (slug: string, body: unknown, h?: H) =>
    feedbackRoute(req("PUT", `/api/problems/${slug}/difficulty-feedback`, body, h), params({ slug })),
  report: (body: unknown, h?: H) => reportRoute(req("POST", "/api/reports", body, h)),
  mod: (body: unknown, h?: H) => modRoute(req("POST", "/api/mod/actions", body, h)),
};

async function signIn(user: User | null) {
  state.cookies.clear();
  if (user) state.cookies.set(SESSION_COOKIE, await signSessionToken(user.id));
}
async function as<T>(user: User | null, fn: () => Promise<T>): Promise<T> {
  await signIn(user);
  return fn();
}

async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/** Rows in every community table: rejected requests must not change it. */
async function communityRows(): Promise<string> {
  const db = getTestDb();
  const counts = await Promise.all([
    db.$count(comments),
    db.$count(commentVotes),
    db.$count(problemVotes),
    db.$count(problemDifficultyFeedback),
    db.$count(reports),
    db.$count(moderationActions),
    db.$count(contentRevisions),
    db.$count(discussionThreads),
  ]);
  const [snapshot] = await db
    .select({
      sum: sql<string>`(select coalesce(sum(up_count + down_count + reply_count), 0) || ':' || string_agg(status::text || has_spoiler::text || body_md, ',' order by id) from comments)
        || '|' || (select coalesce(sum(like_count + dislike_count), 0) from problems)
        || '|' || (select coalesce(string_agg(coalesce(community_suspended_until::text, '-'), ','), '') from users)
        || '|' || (select coalesce(string_agg(coalesce(locked_at::text, '-'), ','), '') from discussion_threads)`,
    })
    .from(sql`(select 1) one`);
  return `${counts.join(",")}#${snapshot.sum ?? ""}`;
}

let problem: Problem;
const SLUG = "two-sum";
const target = `problem:${SLUG}`;

beforeAll(() => {
  state.db = getTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  state.flags = { enabled: true, readOnly: false, contactEmail: null };
  state.cookies.clear();
  problem = await createProblem({ slug: SLUG, title: "Two Sum" });
});
afterAll(closeTestDb);

async function post(user: User, body: string, extra: Record<string, unknown> = {}) {
  const res = await as(user, () => api.create({ target, body, ...extra }));
  expect(res.status, JSON.stringify(await res.clone().json())).toBe(201);
  return (await json<{ comment: CommentView }>(res)).comment;
}

async function list(user: User | null, query = ""): Promise<CommentPage> {
  const res = await as(user, () => api.list(SLUG, query));
  expect(res.status).toBe(200);
  return json<CommentPage>(res);
}

// ---------------------------------------------------------------------------

describe("AC-C-GEN-1 flag off", () => {
  it("every community route answers 404 and writes nothing", async () => {
    const user = await trustedUser(problem.id);
    const c = await insertComment({ problemId: problem.id, authorId: user.id });
    state.flags.enabled = false;
    await signIn(user);
    const before = await communityRows();
    const responses = await Promise.all([
      api.list(SLUG),
      api.create({ target, body: "hello" }),
      api.get(c.id),
      api.get(c.id, true),
      api.edit(c.id, { body: "edited" }),
      api.del(c.id),
      api.replies(c.id),
      api.vote(c.id, { value: 1 }),
      api.problemVote(SLUG, { value: 1 }),
      api.feedback(SLUG, { value: 0 }),
      api.report({ targetType: "comment", targetId: c.id, reason: "spam" }),
      api.mod({ action: "hide", targetType: "comment", targetId: c.id, reason: "x" }),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(await communityRows()).toBe(before);
  });
});

describe("AC-C-GEN-2 read-only", () => {
  it("writes answer 503 community_read_only, reads work", async () => {
    const user = await trustedUser(problem.id);
    const c = await insertComment({ problemId: problem.id, authorId: user.id });
    state.flags.readOnly = true;
    await signIn(user);
    const before = await communityRows();
    for (const res of [
      await api.create({ target, body: "hello" }),
      await api.edit(c.id, { body: "edited" }),
      await api.del(c.id),
      await api.vote(c.id, { value: 1 }),
      await api.problemVote(SLUG, { value: 1 }),
      await api.feedback(SLUG, { value: 0 }),
      await api.report({ targetType: "comment", targetId: c.id, reason: "spam" }),
      await api.mod({ action: "hide", targetType: "comment", targetId: c.id, reason: "x" }),
    ]) {
      expect(res.status).toBe(503);
      expect(await json(res)).toMatchObject({ code: "community_read_only" });
    }
    expect(await communityRows()).toBe(before);
    expect((await api.list(SLUG)).status).toBe(200);
    expect((await api.get(c.id)).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------

type Mutation = {
  name: string;
  call: (body: unknown, h?: H) => Promise<Response>;
  valid: () => unknown;
  maxBytes: number;
};

describe("AC-C-GEN-3 check order (generic steps)", () => {
  let c: { id: string };
  let author: User;

  const routes = (): Mutation[] => [
    { name: "create", call: (b, h) => api.create(b, h), valid: () => ({ target, body: "A question" }), maxBytes: 64 * 1024 },
    { name: "edit", call: (b, h) => api.edit(c.id, b, h), valid: () => ({ body: "edited" }), maxBytes: 64 * 1024 },
    { name: "delete", call: (b, h) => api.del(c.id, b, h), valid: () => ({}), maxBytes: 8 * 1024 },
    { name: "vote", call: (b, h) => api.vote(c.id, b, h), valid: () => ({ value: 1 }), maxBytes: 8 * 1024 },
    { name: "problemVote", call: (b, h) => api.problemVote(SLUG, b, h), valid: () => ({ value: 1 }), maxBytes: 8 * 1024 },
    { name: "feedback", call: (b, h) => api.feedback(SLUG, b, h), valid: () => ({ value: 0 }), maxBytes: 8 * 1024 },
    {
      name: "report",
      call: (b, h) => api.report(b, h),
      valid: () => ({ targetType: "comment", targetId: c.id, reason: "spam" }),
      maxBytes: 8 * 1024,
    },
    {
      name: "mod",
      call: (b, h) => api.mod(b, h),
      valid: () => ({ action: "hide", targetType: "comment", targetId: c.id, reason: "x" }),
      maxBytes: 8 * 1024,
    },
  ];

  beforeEach(async () => {
    author = await trustedUser(problem.id);
    c = await insertComment({ problemId: problem.id, authorId: author.id });
  });

  it("403 Content-Type → 403 Origin → 401 → 413 → 400 (Zod, \\u0000); nothing written", async () => {
    const stranger = await trustedUser(problem.id);
    const before = await communityRows();
    for (const r of routes()) {
      await signIn(stranger);
      expect((await r.call(r.valid(), { "Content-Type": "text/plain" })).status, `${r.name} ct`).toBe(403);
      expect((await r.call(r.valid(), { Origin: "http://evil.example" })).status, `${r.name} origin`).toBe(403);
      // Auth before body: no cookie + a broken body → 401.
      await signIn(null);
      expect((await r.call("{not json")).status, `${r.name} 401`).toBe(401);
      await signIn(stranger);
      const big = JSON.stringify({ pad: "x".repeat(r.maxBytes + 10) });
      expect((await r.call(big)).status, `${r.name} 413`).toBe(413);
      expect((await r.call("{not json")).status, `${r.name} bad json`).toBe(400);
      expect((await r.call({ ...(r.valid() as object), extra: 1 })).status, `${r.name} strict`).toBe(400);
    }
    // \u0000 in text fields.
    await signIn(stranger);
    expect((await api.create({ target, body: "a\u0000b" })).status).toBe(400);
    expect((await api.report({ targetType: "comment", targetId: c.id, reason: "other", details: "x\u0000" })).status).toBe(400);
    expect((await api.mod({ action: "hide", targetType: "comment", targetId: c.id, reason: "x\u0000" })).status).toBe(400);
    expect(await communityRows()).toBe(before);
  });

  it("404 unknown target comes before 403 suspended", async () => {
    const suspended = await trustedUser(problem.id, {
      communitySuspendedUntil: new Date(Date.now() + 7 * 24 * HOUR),
    });
    await signIn(suspended);
    const before = await communityRows();
    expect((await api.create({ target: "problem:no-such-problem", body: "x" })).status).toBe(404);
    expect((await api.create({ target, parentId: UNKNOWN, body: "x" })).status).toBe(404);
    expect((await api.edit(UNKNOWN, { body: "x" })).status).toBe(404);
    expect((await api.del(UNKNOWN)).status).toBe(404);
    expect((await api.vote(UNKNOWN, { value: 1 })).status).toBe(404);
    expect((await api.problemVote("no-such-problem", { value: 1 })).status).toBe(404);
    expect((await api.feedback("no-such-problem", { value: 1 })).status).toBe(404);
    expect((await api.report({ targetType: "comment", targetId: UNKNOWN, reason: "spam" })).status).toBe(404);
    expect(await communityRows()).toBe(before);
  });

  it("AC-C-RP-5 suspended: 403 {code: suspended, until} on every community write, practice still works", async () => {
    const until = new Date(Date.now() + 7 * 24 * HOUR);
    const suspended = await trustedUser(problem.id, { communitySuspendedUntil: until });
    const own = await insertComment({ problemId: problem.id, authorId: suspended.id });
    await signIn(suspended);
    const before = await communityRows();
    for (const res of [
      await api.create({ target, body: "hello" }),
      await api.create({ target, parentId: c.id, body: "hello" }),
      await api.edit(own.id, { body: "edited" }),
      await api.del(own.id),
      await api.vote(c.id, { value: 1 }),
      await api.problemVote(SLUG, { value: 1 }),
      await api.feedback(SLUG, { value: 0 }),
      await api.report({ targetType: "comment", targetId: c.id, reason: "spam" }),
    ]) {
      expect(res.status).toBe(403);
      const body = await json<{ code: string; until: string }>(res);
      expect(body.code).toBe("suspended");
      expect(new Date(body.until).getTime()).toBe(until.getTime());
    }
    expect(await communityRows()).toBe(before);
    // Reads still work.
    expect((await api.list(SLUG)).status).toBe(200);
    // Practice is unaffected.
    await createTestCases(problem.id, 3);
    const submit = await submitRoute(
      req("POST", `/api/problems/${SLUG}/submit`, { language: "python", code: "class Solution:\n    pass\n" }),
      params({ slug: SLUG }),
    );
    expect(submit.status).toBe(202);
  });

  it("an expired suspension no longer blocks", async () => {
    const user = await trustedUser(problem.id, { communitySuspendedUntil: new Date(Date.now() - MIN) });
    await post(user, "back again");
  });

  it("403 suspended comes before 409 state; 409 state before 429 rate", async () => {
    const suspended = await trustedUser(problem.id, { communitySuspendedUntil: new Date(Date.now() + HOUR) });
    const own = await insertComment({ problemId: problem.id, authorId: suspended.id });
    await signIn(suspended);
    // Self-vote would be 409; suspension wins.
    expect((await api.vote(own.id, { value: 1 })).status).toBe(403);

    // A TL0 user at the vote limit voting on their own comment → 409, not 429.
    const tl0 = await newUser();
    const mine = await insertComment({ problemId: problem.id, authorId: tl0.id });
    const others = await Promise.all(
      Array.from({ length: 30 }, () => insertComment({ problemId: problem.id, authorId: author.id })),
    );
    await getTestDb()
      .insert(commentVotes)
      .values(others.map((o) => ({ commentId: o.id, userId: tl0.id, value: 1, updatedAt: new Date(Date.now() - MIN) })));
    await signIn(tl0);
    expect((await api.vote(mine.id, { value: 1 })).status).toBe(409);
    const limited = await api.vote(c.id, { value: 1 });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------

describe("comments", () => {
  it("AC-C-CM-1 comment, reply, and a reply to a reply attaches to the top-level parent", async () => {
    const alice = await trustedUser(problem.id, { username: "alice" });
    const bob = await trustedUser(problem.id, { username: "bob" });
    const top = await post(alice, "Why does the order matter?");
    const reply = await post(bob, "Look up first, then store.", { parentId: top.id });
    expect(reply).toMatchObject({ parentId: top.id, depth: 1 });
    const replyToReply = await post(alice, "@bob thanks", { parentId: reply.id });
    expect(replyToReply).toMatchObject({ parentId: top.id, depth: 1 });
    const page = await list(bob);
    expect(page.comments).toHaveLength(1);
    expect(page.comments[0].replies.map((r) => r.bodyMd)).toEqual(["Look up first, then store.", "@bob thanks"]);
    expect(page.comments[0].replies[1].isThreadStarter).toBe(true);
    const { rows } = await getTestDb().execute<{ n: number }>(sql`SELECT max(depth)::int AS n FROM comments`);
    expect(rows[0].n).toBe(1);
    expect(await counterDrift(getTestDb())).toEqual([]);
  });

  it("AC-C-CM-2 body limits → 400 with a field message", async () => {
    const user = await trustedUser(problem.id);
    await signIn(user);
    const fences = (n: number) => Array.from({ length: n }, (_, i) => "```\ncode " + i + "\n```").join("\n\n");
    const lines = (n: number) => "```python\n" + Array.from({ length: n }, (_, i) => `x = ${i}`).join("\n") + "\n```";
    for (const body of ["", "   \n ", "x".repeat(10_001), "a\u0000b", "bell\u0007", fences(9), lines(201)]) {
      const res = await api.create({ target, body });
      expect(res.status, body.slice(0, 20)).toBe(400);
      expect((await json<{ fieldErrors: { body: string } }>(res)).fieldErrors.body).toBeTruthy();
    }
    for (const body of ["x".repeat(10_000), fences(8), lines(200)]) {
      expect((await api.create({ target, body })).status).toBe(201);
    }
  });

  it("AC-C-CM-3 edit within 24 h stores a revision; after 24 h → 409; edited mark after 5 min", async () => {
    const user = await trustedUser(problem.id);
    const fresh = await post(user, "first version");
    await signIn(user);
    let res = await api.edit(fresh.id, { body: "second version" });
    expect(res.status).toBe(200);
    const revisions = await getTestDb().select().from(contentRevisions);
    expect(revisions).toMatchObject([{ targetType: "comment", targetId: fresh.id, bodyMd: "first version", editedBy: user.id }]);
    // Edited within the first 5 minutes: no mark.
    expect((await list(user)).comments.find((c) => c.id === fresh.id)?.edited).toBe(false);

    const older = await insertComment({ problemId: problem.id, authorId: user.id, body: "older", createdAt: new Date(Date.now() - 10 * MIN) });
    res = await api.edit(older.id, { body: "older, edited" });
    expect(res.status).toBe(200);
    const page = await list(user);
    expect(page.comments.find((c) => c.id === older.id)).toMatchObject({ edited: true, bodyMd: "older, edited" });

    const stale = await insertComment({ problemId: problem.id, authorId: user.id, body: "stale", createdAt: new Date(Date.now() - 25 * HOUR) });
    res = await api.edit(stale.id, { body: "too late" });
    expect(res.status).toBe(409);
    expect(await json(res)).toMatchObject({ code: "edit_window_closed" });

    // Only the author.
    const other = await trustedUser(problem.id);
    await signIn(other);
    expect((await api.edit(fresh.id, { body: "hijack" })).status).toBe(403);
  });

  it("AC-C-CM-4 delete: with replies → placeholder without body or author; without → gone; counters consistent", async () => {
    const alice = await trustedUser(problem.id, { username: "alice" });
    const bob = await trustedUser(problem.id, { username: "bob" });
    const withReplies = await post(alice, "has replies");
    await post(bob, "a reply", { parentId: withReplies.id });
    const lonely = await post(alice, "no replies");
    await signIn(alice);
    expect((await api.del(withReplies.id)).status).toBe(200);
    expect((await api.del(lonely.id)).status).toBe(200);
    expect((await api.del(lonely.id)).status).toBe(404);
    const res = await as(bob, () => api.list(SLUG));
    const text = await res.text();
    expect(text).not.toContain("has replies");
    expect(text).not.toContain("no replies");
    expect(text).not.toContain("alice");
    const page = JSON.parse(text) as CommentPage & { commentCount: number };
    expect(page.comments).toHaveLength(1);
    expect(page.comments[0]).toMatchObject({ id: withReplies.id, kind: "placeholder", author: null, bodyMd: null, status: "deleted" });
    expect(page.comments[0].replies).toHaveLength(1);
    expect(page.commentCount).toBe(1);
    expect(await counterDrift(getTestDb())).toEqual([]);
    // Votes on deleted content → 409.
    await signIn(bob);
    expect((await api.vote(withReplies.id, { value: 1 })).status).toBe(409);
  });

  it("AC-C-CM-5 spoilers: no body for non-solvers until reveal=1; authors and solvers see it", async () => {
    const author = await trustedUser(problem.id);
    const SECRET = "use a hash map: seen[target - x]";
    const spoiler = await post(author, SECRET, { hasSpoiler: true });
    const otherProblem = await createProblem();
    const nonSolver = await trustedUser(otherProblem.id);
    const solver = await trustedUser(problem.id);

    const res = await as(nonSolver, () => api.list(SLUG));
    const text = await res.text();
    expect(text).not.toContain(SECRET);
    const masked = (JSON.parse(text) as CommentPage).comments[0];
    expect(masked).toMatchObject({ id: spoiler.id, bodyMd: null, spoilerMasked: true, hasSpoiler: true });
    expect(await (await as(null, () => api.list(SLUG))).text()).not.toContain(SECRET);
    // Single GET without reveal: still masked.
    expect(await (await as(nonSolver, () => api.get(spoiler.id))).text()).not.toContain(SECRET);

    const revealed = await json<{ comment: CommentView }>(await as(nonSolver, () => api.get(spoiler.id, true)));
    expect(revealed.comment.bodyMd).toBe(SECRET);
    const guestRevealed = await json<{ comment: CommentView }>(await as(null, () => api.get(spoiler.id, true)));
    expect(guestRevealed.comment.bodyMd).toBe(SECRET);

    expect((await list(author)).comments[0]).toMatchObject({ bodyMd: SECRET, spoilerMasked: false });
    expect((await list(solver)).comments[0]).toMatchObject({ bodyMd: SECRET, spoilerMasked: false });
  });

  it("hidden_pending: the author sees it, others see nothing (not even a placeholder)", async () => {
    const author = await trustedUser(problem.id);
    const held = await insertComment({ problemId: problem.id, authorId: author.id, body: "held text", status: "hidden_pending" });
    expect((await list(author)).comments.map((c) => c.id)).toEqual([held.id]);
    const other = await trustedUser(problem.id);
    expect(await (await as(other, () => api.list(SLUG))).text()).not.toContain("held text");
    expect((await list(other)).comments).toEqual([]);
    expect((await as(other, () => api.get(held.id))).status).toBe(404);
    const mod = await withRole(await trustedUser(problem.id), "moderator");
    expect((await list(mod)).comments.map((c) => c.id)).toEqual([held.id]);
  });

  it("AC-C-CM-6 Best and New: 55 comments, page size 20, no duplicates and no gaps; replies oldest first", async () => {
    const author = await trustedUser(problem.id);
    const base = Date.now() - 60 * MIN;
    const made: { id: string; up: number; down: number; at: number }[] = [];
    for (let i = 0; i < 55; i += 1) {
      const up = (i * 7) % 11;
      const down = (i * 3) % 5;
      // Some identical timestamps to exercise the id tie-break.
      const at = base + Math.floor(i / 3) * 1000;
      const c = await insertComment({ problemId: problem.id, authorId: author.id, up, down, createdAt: new Date(at) });
      made.push({ id: c.id, up, down, at });
    }
    // The stored rank (SQL); it equals wilsonLowerBound within 1e-9 (migration test), but
    // float noise around 0 must not decide the expected order here.
    const ranks = new Map(
      (await getTestDb().select({ id: comments.id, rank: comments.rankBest }).from(comments)).map((r) => [r.id, r.rank!]),
    );
    for (const m of made) expect(Math.abs(ranks.get(m.id)! - wilsonLowerBound(m.up, m.down))).toBeLessThan(1e-9);
    const expectBest = [...made]
      .sort(
        (a, b) => ranks.get(b.id)! - ranks.get(a.id)! || b.at - a.at || (b.id < a.id ? -1 : b.id > a.id ? 1 : 0),
      )
      .map((m) => m.id);
    const expectNew = [...made].sort((a, b) => b.at - a.at || (b.id < a.id ? -1 : 1)).map((m) => m.id);

    for (const [sort, expected] of [
      ["best", expectBest],
      ["new", expectNew],
    ] as const) {
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page: CommentPage = await list(author, `&sort=${sort}${cursor ? `&cursor=${cursor}` : ""}`);
        expect(page.comments.length).toBeLessThanOrEqual(20);
        seen.push(...page.comments.map((c) => c.id));
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor && pages < 10);
      expect(pages, sort).toBe(3);
      expect(new Set(seen).size).toBe(55);
      expect(seen, sort).toEqual(expected);
    }

    // Replies: oldest first, 3 inline, the rest through /replies.
    const top = expectNew[0];
    for (let i = 0; i < 5; i += 1) {
      await insertComment({ problemId: problem.id, authorId: author.id, parentId: top, body: `reply ${i}`, createdAt: new Date(base + i * 1000) });
    }
    const page = await list(author, "&sort=new");
    const withReplies = page.comments.find((c) => c.id === top)!;
    expect(withReplies.replies.map((r) => r.bodyMd)).toEqual(["reply 0", "reply 1", "reply 2"]);
    expect(withReplies.moreReplies).toBe(true);
    const all = await json<{ replies: CommentView[]; nextCursor: string | null }>(await api.replies(top));
    expect(all.replies.map((r) => r.bodyMd)).toEqual(["reply 0", "reply 1", "reply 2", "reply 3", "reply 4"]);
    expect(all.nextCursor).toBeNull();
    // Malformed cursors are a 400, not a 500.
    expect((await api.list(SLUG, "&cursor=%%%")).status).toBe(400);
    expect((await api.list(SLUG, "&cursor=bm9wZQ")).status).toBe(400);
    expect((await api.list(SLUG, "&sort=hot")).status).toBe(400);
  });
});

// ---------------------------------------------------------------------------

describe("votes", () => {
  it("AC-C-VT-2 self-vote 409, TL0 downvote 403 trust_required, removed/deleted 409, values and removal", async () => {
    const author = await trustedUser(problem.id);
    const c = await post(author, "vote on me");
    await signIn(author);
    expect(await json(await api.vote(c.id, { value: 1 }))).toMatchObject({ code: "self_vote" });

    const tl0 = await newUser();
    const oldTl0 = await oldUnsolvedUser();
    for (const u of [tl0, oldTl0]) {
      await signIn(u);
      const res = await api.vote(c.id, { value: -1 });
      expect(res.status).toBe(403);
      expect(await json(res)).toMatchObject({ code: "trust_required" });
      expect((await api.vote(c.id, { value: 1 })).status).toBe(200);
    }
    const tl1 = await trustedUser(problem.id);
    await signIn(tl1);
    expect(await json(await api.vote(c.id, { value: -1 }))).toEqual({ score: 1, myVote: -1 });
    expect(await json(await api.vote(c.id, { value: 0 }))).toEqual({ score: 2, myVote: 0 });
    expect(await json(await api.vote(c.id, { value: 1 }))).toEqual({ score: 3, myVote: 1 });
    expect((await api.vote(c.id, { value: 2 })).status).toBe(400);
    expect((await list(tl1)).comments[0]).toMatchObject({ score: 3, myVote: 1 });

    // Removed with a reply: listed as a placeholder → 409 (without replies it is not listed at all → 404).
    const removed = await insertComment({ problemId: problem.id, authorId: author.id, status: "removed" });
    await insertComment({ problemId: problem.id, authorId: tl1.id, parentId: removed.id });
    expect((await api.vote(removed.id, { value: 1 })).status).toBe(409);
    const removedAlone = await insertComment({ problemId: problem.id, authorId: author.id, status: "removed" });
    expect((await api.vote(removedAlone.id, { value: 1 })).status).toBe(404);
    expect(await counterDrift(getTestDb())).toEqual([]);
  });

  it("AC-C-VT-4 problem like % hidden below 10 votes, integer percent from 10", async () => {
    const voters: User[] = [];
    for (let i = 0; i < 10; i += 1) voters.push(await trustedUser(problem.id));
    let last: Record<string, unknown> = {};
    for (let i = 0; i < 9; i += 1) {
      await signIn(voters[i]);
      last = await json(await api.problemVote(SLUG, { value: i < 6 ? 1 : -1 }));
      expect(last.likePercent).toBeNull();
    }
    expect((await getProblemSummary(getTestDb(), SLUG, null))!.summary.likePercent).toBeNull();
    await signIn(voters[9]);
    last = await json(await api.problemVote(SLUG, { value: 1 }));
    expect(last).toMatchObject({ likes: 7, dislikes: 3, likePercent: 70, myVote: 1 });
    const summary = (await getProblemSummary(getTestDb(), SLUG, voters[9].id))!.summary;
    expect(summary).toMatchObject({ likes: 7, dislikes: 3, likePercent: 70, myVote: 1 });
    // TL0 cannot dislike a problem either.
    await signIn(await newUser());
    expect((await api.problemVote(SLUG, { value: -1 })).status).toBe(403);
    expect(await counterDrift(getTestDb())).toEqual([]);
  });

  it("AC-C-VT-5 difficulty feedback: solvers only, summary from 10 answers, never changes ratings", async () => {
    await getTestDb().update(problems).set({ authorRating: 1180, ratingAdjust: 12 }).where(eq(problems.id, problem.id));
    const owner = await trustedUser(problem.id);
    const { room } = await createRoom({ owner });
    await getTestDb()
      .update(roomMembers)
      .set({ rating: 1500, ratingSource: "default" })
      .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.userId, owner.id)));
    const snapshot = async () => {
      const [p] = await getTestDb()
        .select({ a: problems.authorRating, r: problems.ratingAdjust })
        .from(problems)
        .where(eq(problems.id, problem.id));
      const m = await getTestDb().select({ r: roomMembers.rating }).from(roomMembers);
      return JSON.stringify({ p, m });
    };
    const before = await snapshot();

    const unsolved = await oldUnsolvedUser();
    await signIn(unsolved);
    const denied = await api.feedback(SLUG, { value: 1 });
    expect(denied.status).toBe(403);
    expect(await json(denied)).toMatchObject({ code: "solve_required" });

    for (let i = 0; i < 9; i += 1) {
      const solver = await trustedUser(problem.id);
      await signIn(solver);
      expect((await api.feedback(SLUG, { value: i < 6 ? 1 : 0 })).status).toBe(200);
    }
    expect((await getProblemSummary(getTestDb(), SLUG, null))!.summary.feedback).toEqual({ total: 9, verdict: null });
    await signIn(owner);
    expect(await json(await api.feedback(SLUG, { value: -1 }))).toEqual({ myFeedback: -1 });
    expect((await getProblemSummary(getTestDb(), SLUG, null))!.summary.feedback).toEqual({ total: 10, verdict: "harder" });
    expect(await json(await api.feedback(SLUG, { value: null }))).toEqual({ myFeedback: null });
    expect(await snapshot()).toBe(before);
  });
});

// ---------------------------------------------------------------------------

describe("reports and moderation", () => {
  const report = (id: string, reason = "spam", details?: string) =>
    api.report({ targetType: "comment", targetId: id, reason, ...(details === undefined ? {} : { details }) });

  it("AC-C-RP-1 once per user; reasons are an enum; details ≤ 1000; not your own", async () => {
    const author = await trustedUser(problem.id);
    const c = await post(author, "reported");
    const reporter = await trustedUser(problem.id);
    await signIn(reporter);
    expect((await report(c.id, "nonsense")).status).toBe(400);
    expect((await report(c.id, "spam", "x".repeat(1001))).status).toBe(400);
    expect((await report(c.id, "spam", "x".repeat(1000))).status).toBe(201);
    const again = await report(c.id, "harassment");
    expect(again.status).toBe(409);
    expect(await json(again)).toMatchObject({ code: "already_reported" });
    await signIn(author);
    expect((await report(c.id)).status).toBe(409);
    expect(await getTestDb().$count(reports)).toBe(1);
  });

  it("AC-C-RP-2 three TL1 reports hide it; the author still sees it, others see nothing", async () => {
    const author = await trustedUser(problem.id);
    const c = await post(author, "spammy text");
    for (const u of [await newUser(), await oldUnsolvedUser(), await trustedUser(problem.id)]) {
      await signIn(u);
      expect((await report(c.id)).status).toBe(201);
    }
    // Two TL0 + one TL1: still visible.
    expect((await list(null)).comments).toHaveLength(1);
    for (const u of [await trustedUser(problem.id), await trustedUser(problem.id)]) {
      await signIn(u);
      expect((await report(c.id)).status).toBe(201);
    }
    const [row] = await getTestDb().select({ status: comments.status }).from(comments).where(eq(comments.id, c.id));
    expect(row.status).toBe("hidden_pending");
    const audit = await getTestDb().select().from(moderationActions);
    expect(audit).toMatchObject([{ actorId: null, action: "hide", targetId: c.id }]);
    expect((await list(author)).comments.map((x) => x.id)).toEqual([c.id]);
    const other = await trustedUser(problem.id);
    expect(await (await as(other, () => api.list(SLUG))).text()).not.toContain("spammy text");
    expect((await list(null)).comments).toEqual([]);
    expect(await counterDrift(getTestDb())).toEqual([]);
  });

  it("one moderator report hides immediately", async () => {
    const author = await trustedUser(problem.id);
    const c = await post(author, "bad");
    const mod = await withRole(await newUser(), "moderator");
    await signIn(mod);
    expect((await report(c.id)).status).toBe(201);
    const [row] = await getTestDb().select({ status: comments.status }).from(comments).where(eq(comments.id, c.id));
    expect(row.status).toBe("hidden_pending");
  });

  it("AC-C-RP-3 every action needs a reason, writes the audit log and resolves reports; non-moderators 403", async () => {
    const author = await trustedUser(problem.id, { username: "author1" });
    const c = await post(author, "moderate me");
    const reporter = await trustedUser(problem.id);
    await signIn(reporter);
    await report(c.id);
    const [thread] = await getTestDb().select({ id: discussionThreads.id }).from(discussionThreads);

    // Non-moderators.
    const mod = (body: Record<string, unknown>) => api.mod(body);
    const res403 = await mod({ action: "hide", targetType: "comment", targetId: c.id, reason: "x" });
    expect(res403.status).toBe(403);

    const moderator = await withRole(await trustedUser(problem.id), "moderator");
    await signIn(moderator);
    expect((await mod({ action: "hide", targetType: "comment", targetId: c.id })).status).toBe(400);
    expect((await mod({ action: "hide", targetType: "comment", targetId: c.id, reason: "   " })).status).toBe(400);
    expect((await mod({ action: "hide", targetType: "thread", targetId: c.id, reason: "x" })).status).toBe(400);
    expect((await mod({ action: "hide", targetType: "comment", targetId: UNKNOWN, reason: "x" })).status).toBe(404);

    const steps: [Record<string, unknown>, number][] = [
      [{ action: "hide", targetType: "comment", targetId: c.id, reason: "spam" }, 200],
      [{ action: "hide", targetType: "comment", targetId: c.id, reason: "again" }, 409],
      [{ action: "restore", targetType: "comment", targetId: c.id, reason: "fine after all" }, 200],
      [{ action: "set_spoiler", targetType: "comment", targetId: c.id, reason: "code", value: true }, 200],
      [{ action: "remove", targetType: "comment", targetId: c.id, reason: "off topic" }, 200],
      [{ action: "remove", targetType: "comment", targetId: c.id, reason: "again" }, 409],
      [{ action: "restore", targetType: "comment", targetId: c.id, reason: "appeal" }, 200],
      [{ action: "lock", targetType: "thread", targetId: thread.id, reason: "heated" }, 200],
      [{ action: "lock", targetType: "thread", targetId: thread.id, reason: "again" }, 409],
      [{ action: "suspend", targetType: "user", targetId: author.id, reason: "repeat", days: 7 }, 200],
      [{ action: "suspend", targetType: "user", targetId: author.id, reason: "worse", days: 30 }, 200],
      [{ action: "suspend", targetType: "user", targetId: author.id, reason: "no days" }, 400],
      [{ action: "unsuspend", targetType: "user", targetId: author.id, reason: "served" }, 200],
      [{ action: "unsuspend", targetType: "user", targetId: author.id, reason: "again" }, 409],
    ];
    for (const [body, status] of steps) {
      const res = await mod(body);
      expect(res.status, JSON.stringify(body)).toBe(status);
    }
    const audit = await getTestDb().select().from(moderationActions);
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(["hide", "restore", "set_spoiler", "remove", "lock", "suspend", "unsuspend"]),
    );
    expect(audit.filter((a) => a.actorId === moderator.id)).toHaveLength(9);
    const [rep] = await getTestDb().select().from(reports);
    expect(rep).toMatchObject({ status: "actioned", resolvedBy: moderator.id });

    // Locked thread: new comments 409 for users; unlock.
    const user = await trustedUser(problem.id);
    await signIn(user);
    const locked = await api.create({ target, body: "can I post?" });
    expect(locked.status).toBe(409);
    expect(await json(locked)).toMatchObject({ code: "thread_locked" });
    await signIn(moderator);
    expect((await mod({ action: "unlock", targetType: "thread", targetId: thread.id, reason: "calm" })).status).toBe(200);
    await post(user, "now I can");

    // Dismiss resolves as dismissed; with no open reports → 409.
    const c2 = await post(user, "second");
    await signIn(reporter);
    await report(c2.id, "off_topic");
    await signIn(moderator);
    expect((await mod({ action: "dismiss", targetType: "comment", targetId: c2.id, reason: "fine" })).status).toBe(200);
    expect((await mod({ action: "dismiss", targetType: "comment", targetId: c2.id, reason: "fine" })).status).toBe(409);
    const [dismissed] = await getTestDb().select().from(reports).where(eq(reports.targetId, c2.id));
    expect(dismissed.status).toBe("dismissed");

    // A moderator cannot suspend an admin; an admin can suspend a moderator.
    const admin = await withRole(await trustedUser(problem.id), "admin");
    expect((await mod({ action: "suspend", targetType: "user", targetId: admin.id, reason: "x", days: 7 })).status).toBe(403);
    await signIn(admin);
    expect((await mod({ action: "suspend", targetType: "user", targetId: moderator.id, reason: "x", days: 7 })).status).toBe(200);
    expect(await counterDrift(getTestDb())).toEqual([]);
  });

  it("a removed comment shows its reason to its author", async () => {
    const author = await trustedUser(problem.id);
    const c = await post(author, "to remove");
    const moderator = await withRole(await trustedUser(problem.id), "moderator");
    await signIn(moderator);
    await api.mod({ action: "remove", targetType: "comment", targetId: c.id, reason: "Copied statement" });
    expect((await list(author)).comments[0]).toMatchObject({ kind: "placeholder", removedReason: "Copied statement", bodyMd: null });
    const other = await trustedUser(problem.id);
    expect((await list(other)).comments).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe("rate limits and spam", () => {
  it("AC-C-RL-2 duplicate by the same author → 409; third author with the same body → hidden_pending", async () => {
    const BODY = "Great problem, thanks!";
    const a = await trustedUser(problem.id);
    await post(a, BODY);
    await signIn(a);
    const dup = await api.create({ target, body: "  great PROBLEM,   thanks! " });
    expect(dup.status).toBe(409);
    expect(await json(dup)).toMatchObject({ code: "duplicate" });
    const b = await trustedUser(problem.id);
    expect((await post(b, BODY)).status).toBe("visible");
    const c = await trustedUser(problem.id);
    expect((await post(c, BODY)).status).toBe("hidden_pending");
    // An old duplicate (> 24 h) does not count.
    const d = await trustedUser(problem.id);
    await insertComment({ problemId: problem.id, authorId: d.id, body: "old body", createdAt: new Date(Date.now() - 25 * HOUR) });
    expect((await post(d, "old body")).status).toBe("visible");
  });

  it("AC-C-RL-3 link caps, shorteners and holds", async () => {
    const oldTl0 = await oldUnsolvedUser();
    await signIn(oldTl0);
    const two = await api.create({ target, body: "see https://a.example and https://b.example" });
    expect(two.status).toBe(400);
    expect(await json(two)).toMatchObject({ code: "too_many_links" });
    expect((await post(oldTl0, "one external https://a.example/x")).status).toBe("hidden_pending");
    expect((await post(oldTl0, "allowlisted https://leetcode.com/problems/two-sum/ and https://github.com/x")).status).toBe(
      "visible",
    );

    const tl1 = await trustedUser(problem.id);
    await signIn(tl1);
    const short = await api.create({ target, body: "https://bit.ly/abc" });
    expect(short.status).toBe(400);
    expect(await json(short)).toMatchObject({ code: "shortener" });
    expect((await post(tl1, "external is fine https://a.example")).status).toBe("visible");
    const eleven = Array.from({ length: 11 }, (_, i) => `https://s${i}.example`).join(" ");
    expect((await api.create({ target, body: eleven })).status).toBe(400);

    // A brand-new account: its first 3 comments with ANY link are held.
    const fresh = await newUser();
    expect((await post(fresh, "no links here")).status).toBe("visible");
    expect((await post(fresh, "docs https://docs.python.org/3/")).status).toBe("hidden_pending");
    expect(await counterDrift(getTestDb())).toEqual([]);
  });

  it("TL0 comments: the 4th within 10 minutes and the 11th of the day → 429 with Retry-After", async () => {
    const tl0 = await oldUnsolvedUser();
    // 3 in the last 10 minutes.
    for (let i = 0; i < 3; i += 1) {
      await insertComment({ problemId: problem.id, authorId: tl0.id, createdAt: new Date(Date.now() - (i + 1) * MIN) });
    }
    await signIn(tl0);
    const before = await communityRows();
    const res = await api.create({ target, body: "fourth" });
    expect(res.status).toBe(429);
    const retry = Number(res.headers.get("retry-after"));
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(10 * 60);
    expect(await communityRows()).toBe(before);

    // Move them out of the 10-minute window but keep 10 within the day.
    await getTestDb().update(comments).set({ createdAt: new Date(Date.now() - 2 * HOUR) });
    for (let i = 0; i < 7; i += 1) {
      await insertComment({ problemId: problem.id, authorId: tl0.id, createdAt: new Date(Date.now() - (3 + i) * HOUR) });
    }
    const day = await api.create({ target, body: "eleventh" });
    expect(day.status).toBe(429);
    expect(Number(day.headers.get("retry-after"))).toBeGreaterThan(10 * 60);
    // A moderator has no limit.
    await withRole(tl0, "moderator");
    expect((await api.create({ target, body: "moderators are not limited" })).status).toBe(201);
  });

  it("edit, vote and report limits → 429", async () => {
    const tl0 = await oldUnsolvedUser();
    const mine = await insertComment({ problemId: problem.id, authorId: tl0.id, body: "mine" });
    await getTestDb()
      .insert(contentRevisions)
      .values(Array.from({ length: 10 }, () => ({ targetType: "comment" as const, targetId: mine.id, bodyMd: "x", editedBy: tl0.id })));
    await signIn(tl0);
    expect((await api.edit(mine.id, { body: "edit 11" })).status).toBe(429);

    const author = await trustedUser(problem.id);
    const targets = await Promise.all(Array.from({ length: 6 }, () => insertComment({ problemId: problem.id, authorId: author.id })));
    await getTestDb()
      .insert(reports)
      .values(targets.slice(0, 5).map((t) => ({ reporterId: tl0.id, targetType: "comment" as const, targetId: t.id, reason: "spam" as const })));
    const r = await api.report({ targetType: "comment", targetId: targets[5].id, reason: "spam" });
    expect(r.status).toBe(429);

    // Problem votes share the vote budget (30/h for TL0).
    await getTestDb()
      .insert(commentVotes)
      .values(Array.from({ length: 30 }, (_, i) => ({ commentId: i < 6 ? targets[i].id : mine.id, userId: tl0.id, value: 1 })).slice(0, 6));
    const extra = await Promise.all(Array.from({ length: 24 }, () => insertComment({ problemId: problem.id, authorId: author.id })));
    await getTestDb()
      .insert(commentVotes)
      .values(extra.map((t) => ({ commentId: t.id, userId: tl0.id, value: 1 })));
    expect((await api.problemVote(SLUG, { value: 1 })).status).toBe(429);
  });
});
