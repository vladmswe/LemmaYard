// Query budgets of the community pages (docs/specs/community.md §C.6,
// AC-C-CM-7, AC-C-CM-8), counted with a logging Drizzle client.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/community/flags", () => ({
  communityFlags: () => ({ enabled: true, readOnly: false, contactEmail: null }),
  isCommunityEnabled: () => true,
  requireCommunityPage: () => ({ enabled: true, readOnly: false, contactEmail: null }),
}));

import { getDiscussionTabData, getDiscussPageData } from "@/server/community/pages";
import { schema, type Db } from "@/server/db";
import { commentVotes } from "@/server/db/schema";
import { getProblemPageData } from "@/server/problem-page";

import { insertComment, trustedUser } from "../helpers/community";
import { closeTestDb, createProblem, createTestCases, getTestDb, resetTestDb, testDbUrl } from "../helpers/db";

let pool: Pool;
let logged: string[] = [];
let loggingDb: Db;

beforeAll(() => {
  pool = new Pool({ connectionString: testDbUrl() });
  loggingDb = drizzle(pool, { schema, logger: { logQuery: (query) => logged.push(query) } });
});
beforeEach(resetTestDb);
afterAll(async () => {
  await pool.end();
  await closeTestDb();
});

async function counted<T>(fn: () => Promise<T>): Promise<{ result: T; queries: number }> {
  logged = [];
  const result = await fn();
  return { result, queries: logged.length };
}

async function seed() {
  const problem = await createProblem({ slug: "budget" });
  await createTestCases(problem.id, 3);
  const viewer = await trustedUser(problem.id);
  const author = await trustedUser(problem.id);
  const votes: { commentId: string; userId: string; value: number }[] = [];
  for (let i = 0; i < 25; i += 1) {
    const top = await insertComment({ problemId: problem.id, authorId: author.id, hasSpoiler: i % 5 === 0 });
    votes.push({ commentId: top.id, userId: viewer.id, value: i % 2 === 0 ? 1 : -1 });
    for (let j = 0; j < 5; j += 1) {
      const reply = await insertComment({ problemId: problem.id, authorId: j % 2 ? viewer.id : author.id, parentId: top.id });
      if (j % 2 === 0) votes.push({ commentId: reply.id, userId: viewer.id, value: 1 });
    }
  }
  await getTestDb().insert(commentVotes).values(votes);
  return { problem, viewer };
}

describe("AC-C-CM-8 query budgets", () => {
  it("/problems/[slug]/discuss: ≤ 5 queries (2: summary + viewer, one page with replies, votes and authors)", async () => {
    const { viewer } = await seed();
    for (const sort of ["best", "new"] as const) {
      const { result, queries } = await counted(() =>
        getDiscussPageData(loggingDb, { slug: "budget", userId: viewer.id, sort }),
      );
      expect(result!.page.comments).toHaveLength(20);
      expect(result!.page.comments[1].replies).toHaveLength(3);
      expect(result!.page.comments.some((c) => c.myVote !== 0)).toBe(true);
      expect(queries).toBe(2);
      // The next page costs the same.
      const next = await counted(() =>
        getDiscussPageData(loggingDb, { slug: "budget", userId: viewer.id, sort, cursor: result!.page.nextCursor! }),
      );
      expect(next.result!.page.comments).toHaveLength(5);
      expect(next.queries).toBe(2);
    }
    const guest = await counted(() => getDiscussPageData(loggingDb, { slug: "budget", userId: null, sort: "best" }));
    expect(guest.queries).toBeLessThanOrEqual(5);
  });

  it("Discussion tab: ≤ 3 queries (summary + viewer, Best top 5, New top 5)", async () => {
    const { viewer } = await seed();
    const { result, queries } = await counted(() => getDiscussionTabData(loggingDb, "budget", viewer.id));
    expect(result!.best.comments).toHaveLength(5);
    expect(result!.latest.comments).toHaveLength(5);
    expect(queries).toBeLessThanOrEqual(3);
  });

  it("without a thread yet: no comment query error, empty pages", async () => {
    const problem = await createProblem({ slug: "empty" });
    const user = await trustedUser(problem.id);
    const { result, queries } = await counted(() => getDiscussionTabData(loggingDb, "empty", user.id));
    expect(result!.best.comments).toEqual([]);
    expect(result!.summary).toMatchObject({ commentCount: 0, threadId: null, solved: true });
    expect(queries).toBeLessThanOrEqual(3);
  });
});

describe("AC-C-CM-7 the description render does not wait for comments", () => {
  it("getProblemPageData runs the same number of queries with or without a discussion", async () => {
    const problem = await createProblem({ slug: "plain" });
    await createTestCases(problem.id, 3);
    const user = await trustedUser(problem.id);
    const before = await counted(() => getProblemPageData("plain", user.id, loggingDb));
    for (let i = 0; i < 10; i += 1) await insertComment({ problemId: problem.id, authorId: user.id });
    const after = await counted(() => getProblemPageData("plain", user.id, loggingDb));
    expect(after.queries).toBe(before.queries);
    expect(logged.some((q) => /comments|discussion_threads/.test(q))).toBe(false);
  });
});
