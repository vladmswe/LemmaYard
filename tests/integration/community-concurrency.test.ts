// Community C1 under concurrency (docs/specs/community.md AC-C-VT-1,
// AC-C-RL-1): one vote row per (user, target), counters equal a recount, and
// the DB-counted limits hold across two separate pools (two Vercel instances).
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/server/db";

const state = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  cookies: new Map<string, string>(),
}));

vi.mock("@/server/db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/db")>();
  return { ...mod, getDb: () => state.db! };
});

// Each concurrent call carries its own session token (AsyncLocalStorage).
const session = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AsyncLocalStorage } = require("node:async_hooks") as typeof import("node:async_hooks");
  return new AsyncLocalStorage<string>();
});
vi.mock("next/headers", () => ({
  cookies: () => {
    const token = session.getStore() ?? null;
    return Promise.resolve({
      get: (name: string) => (token ? { name, value: token } : undefined),
    });
  },
}));

vi.mock("@/server/community/flags", () => ({
  communityFlags: () => ({ enabled: true, readOnly: false, contactEmail: null }),
  isCommunityEnabled: () => true,
  requireCommunityPage: () => ({ enabled: true, readOnly: false, contactEmail: null }),
}));

import { PUT as voteRoute } from "@/app/api/comments/[id]/vote/route";
import { signSessionToken } from "@/server/auth/token";
import { getCommunityViewer } from "@/server/community/access";
import { createComment } from "@/server/community/comments";
import { CommunityError } from "@/server/community/errors";
import { withCommunityLock } from "@/server/community/limits";
import { counterDrift } from "@/server/community/recount";
import { createDb } from "@/server/db";
import { commentVotes, comments } from "@/server/db/schema";
import { getEnv } from "@/server/env";

import { insertComment, oldUnsolvedUser, trustedUser } from "../helpers/community";
import { closeTestDb, createProblem, getTestDb, resetTestDb, testDbUrl } from "../helpers/db";

const ORIGIN = new URL(getEnv().AUTH_URL).origin;
const HOUR = 60 * 60 * 1000;

/** One vote request as the user behind `token`. */
async function vote(token: string, commentId: string, value: number) {
  const request = new Request(`${ORIGIN}/api/comments/${commentId}/vote`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Origin: ORIGIN },
    body: JSON.stringify({ value }),
  });
  return session.run(token, () => voteRoute(request, { params: Promise.resolve({ id: commentId }) }));
}

beforeAll(() => {
  state.db = getTestDb();
});
beforeEach(resetTestDb);
afterAll(closeTestDb);

describe("AC-C-VT-1 votes under concurrency", () => {
  it("50 concurrent votes by one user end with one row and correct counters", async () => {
    const problem = await createProblem();
    const author = await trustedUser(problem.id);
    const voter = await trustedUser(problem.id);
    const c = await insertComment({ problemId: problem.id, authorId: author.id });
    const token = await signSessionToken(voter.id);
    const values = Array.from({ length: 50 }, (_, i) => [1, -1, 0][i % 3]);
    const responses = await Promise.all(values.map((v) => vote(token, c.id, v)));
    for (const res of responses) expect(res.status).toBe(200);
    const rows = await getTestDb().select().from(commentVotes).where(eq(commentVotes.commentId, c.id));
    expect(rows.length).toBeLessThanOrEqual(1);
    const [counts] = await getTestDb().select({ up: comments.upCount, down: comments.downCount }).from(comments).where(eq(comments.id, c.id));
    expect(counts.up + counts.down).toBe(rows.length);
    if (rows.length === 1) expect(rows[0].value === 1 ? counts.up : counts.down).toBe(1);
    expect(await counterDrift(getTestDb())).toEqual([]);
  });

  it("50 users voting concurrently: counters equal a recount", async () => {
    const problem = await createProblem();
    const author = await trustedUser(problem.id);
    const c = await insertComment({ problemId: problem.id, authorId: author.id });
    const voters = await Promise.all(Array.from({ length: 50 }, () => trustedUser(problem.id)));
    const tokens = await Promise.all(voters.map((v) => signSessionToken(v.id)));
    const responses = await Promise.all(tokens.map((t, i) => vote(t, c.id, i % 4 === 0 ? -1 : 1)));
    for (const res of responses) expect(res.status).toBe(200);
    const [counts] = await getTestDb().select({ up: comments.upCount, down: comments.downCount }).from(comments).where(eq(comments.id, c.id));
    expect(counts).toEqual({ up: 37, down: 13 });
    expect(await counterDrift(getTestDb())).toEqual([]);
  });
});

describe("AC-C-RL-1 limits across two pools", () => {
  it("a TL0 user with 9 comments today gets exactly one more, whichever instance serves it", async () => {
    const problem = await createProblem({ slug: "rl-problem" });
    const tl0 = await oldUnsolvedUser();
    for (let i = 0; i < 9; i += 1) {
      await insertComment({ problemId: problem.id, authorId: tl0.id, createdAt: new Date(Date.now() - (i + 1) * HOUR) });
    }
    const a = createDb(testDbUrl());
    const b = createDb(testDbUrl());
    try {
      const attempt = (db: Db, i: number) =>
        db
          .transaction(async (tx) => {
            const now = new Date();
            await withCommunityLock(tx, tl0.id);
            const viewer = await getCommunityViewer(tx, tl0.id, now);
            await createComment(tx, {
              viewer: viewer!,
              slug: "rl-problem",
              parentId: null,
              body: `concurrent ${i}`,
              hasSpoiler: false,
              now,
            });
            return "ok" as const;
          })
          .catch((error: unknown) => {
            if (error instanceof CommunityError) return error.status;
            throw error;
          });
      const results = await Promise.all(Array.from({ length: 10 }, (_, i) => attempt(i % 2 === 0 ? a.db : b.db, i)));
      expect(results.filter((r) => r === "ok")).toHaveLength(1);
      expect(results.filter((r) => r === 429)).toHaveLength(9);
      expect(await getTestDb().$count(comments, eq(comments.authorId, tl0.id))).toBe(10);
    } finally {
      await a.pool.end();
      await b.pool.end();
    }
    expect(await counterDrift(getTestDb())).toEqual([]);
  });
});
