// Submission history data (AC-M6-1..3) on fixtures inserted through Drizzle:
// only the user's own submit rows, newest first, paginated, filtered by
// problem; detail access control (owner only, runs and malformed ids → null);
// query budgets via the Drizzle logger.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Db } from "@/server/db";
import * as schema from "@/server/db/schema";
import {
  getProblemSubmissions,
  getSubmissionDetail,
  getSubmissionHistory,
} from "@/server/submissions/history";

import {
  closeTestDb,
  createProblem,
  createSubmission,
  createUser,
  getTestDb,
  resetTestDb,
  testDbUrl,
} from "../helpers/db";

type Status = (typeof schema.submissionStatusEnum.enumValues)[number];

let alice: { id: string };
let bob: { id: string };
let carol: { id: string };
const problemIds: Record<string, string> = {};
/** Alice's submit ids, newest first. */
const aliceSubmits: string[] = [];
let aliceRun: string;
let bobSubmit: string;
let waId: string;

const T0 = new Date("2026-10-01T12:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

function finished(status: Status) {
  if (status === "queued") return {};
  if (status === "running") return { startedAt: new Date() };
  return { finishedAt: new Date() };
}

async function sub(
  user: { id: string },
  slug: string,
  status: Status,
  minute: number,
  extra: Partial<typeof schema.submissions.$inferInsert> = {},
) {
  const row = await createSubmission({
    userId: user.id,
    problemId: problemIds[slug],
    status,
    createdAt: at(minute),
    ...finished(status),
    ...extra,
  });
  return row.id;
}

beforeAll(async () => {
  await resetTestDb();
  alice = await createUser({ username: "alice" });
  bob = await createUser({ username: "bob" });
  carol = await createUser({ username: "carol" });
  for (const [slug, title, published] of [
    ["two-sum", "Two Sum", true],
    ["valid-brackets", "Valid Brackets", true],
    ["hidden-one", "Hidden One", false],
  ] as const) {
    const p = await createProblem({
      slug,
      title,
      published,
      signature: { name: "twoSum", params: [{ name: "nums", type: "int[]" }, { name: "target", type: "int" }], returns: "int[]" },
    });
    problemIds[slug] = p.id;
  }

  // Alice: 25 submits over two problems (+1 on an unpublished one), 1 run.
  const statuses: Status[] = ["accepted", "wrong_answer", "runtime_error", "compile_error", "time_limit", "internal_error"];
  const created: { id: string; minute: number }[] = [];
  for (let i = 0; i < 24; i++) {
    const slug = i % 3 === 0 ? "valid-brackets" : "two-sum";
    const id = await sub(alice, slug, statuses[i % statuses.length], i, {
      language: i % 2 === 0 ? "python" : "javascript",
      runtimeMs: 40 + i,
      memoryKb: 16_000 + i,
    });
    created.push({ id, minute: i });
  }
  waId = await sub(alice, "two-sum", "wrong_answer", 30, {
    code: "class Solution:\n    pass\n",
    passedCount: 3,
    totalCount: 10,
    failedTestIndex: 3,
    failedCase: { input: { nums: [1, 2], target: 3 }, expected: [0, 1], actual: [1, 0] },
    stdout: "debug",
  });
  created.push({ id: waId, minute: 30 });
  created.push({ id: await sub(alice, "hidden-one", "accepted", 31), minute: 31 });
  aliceSubmits.push(...created.sort((a, b) => b.minute - a.minute).map((c) => c.id));
  aliceRun = await sub(alice, "two-sum", "accepted", 40, { kind: "run" });

  bobSubmit = await sub(bob, "two-sum", "accepted", 5);
});

afterAll(async () => {
  await resetTestDb();
  await closeTestDb();
});

const db = () => getTestDb();

describe("getSubmissionHistory (AC-M6-1)", () => {
  it("lists only the user's own submits, newest first, with problem and metrics", async () => {
    const page = await getSubmissionHistory({ userId: alice.id, page: 1, pageSize: 10, db: db() });
    expect(page.total).toBe(26);
    expect(page.rows.map((r) => r.id)).toEqual(aliceSubmits.slice(0, 10));
    expect(page.rows.map((r) => r.id)).not.toContain(aliceRun);
    expect(page.rows.map((r) => r.id)).not.toContain(bobSubmit);
    expect(page.filter).toBeNull();
    const first = page.rows[0];
    expect(first.problem).toEqual({ slug: "hidden-one", title: "Hidden One", published: false });
    const wa = page.rows.find((r) => r.id === waId)!;
    expect(wa).toMatchObject({ status: "wrong_answer", language: "python", problem: { slug: "two-sum", title: "Two Sum", published: true } });
  });

  it("paginates: page 2 continues page 1, the last page is partial, past the end is empty with the total", async () => {
    const p1 = await getSubmissionHistory({ userId: alice.id, page: 1, pageSize: 10, db: db() });
    const p2 = await getSubmissionHistory({ userId: alice.id, page: 2, pageSize: 10, db: db() });
    const p3 = await getSubmissionHistory({ userId: alice.id, page: 3, pageSize: 10, db: db() });
    const p4 = await getSubmissionHistory({ userId: alice.id, page: 4, pageSize: 10, db: db() });
    expect(p2.rows.map((r) => r.id)).toEqual(aliceSubmits.slice(10, 20));
    expect(p3.rows.map((r) => r.id)).toEqual(aliceSubmits.slice(20));
    expect(new Set([...p1.rows, ...p2.rows, ...p3.rows].map((r) => r.id)).size).toBe(26);
    expect(p4.rows).toEqual([]);
    expect(p4.total).toBe(26);
  });

  it("filters by problem slug and reports the problem title", async () => {
    const page = await getSubmissionHistory({ userId: alice.id, page: 1, pageSize: 50, problemSlug: "valid-brackets", db: db() });
    expect(page.total).toBe(8);
    expect(page.rows.every((r) => r.problem.slug === "valid-brackets")).toBe(true);
    expect(page.filter).toEqual({ slug: "valid-brackets", title: "Valid Brackets" });
  });

  it("an unknown or malformed slug is an empty filter result, not an error", async () => {
    const unknown = await getSubmissionHistory({ userId: alice.id, page: 1, pageSize: 10, problemSlug: "no-such-problem", db: db() });
    expect(unknown).toMatchObject({ rows: [], total: 0, filter: { slug: "no-such-problem", title: null } });
    const malformed = await getSubmissionHistory({ userId: alice.id, page: 1, pageSize: 10, problemSlug: "Bad Slug!'", db: db() });
    expect(malformed).toMatchObject({ rows: [], total: 0, filter: { slug: "Bad Slug!'", title: null } });
  });

  it("a known problem without submissions keeps its title for the filter chip", async () => {
    const page = await getSubmissionHistory({ userId: bob.id, page: 1, pageSize: 10, problemSlug: "valid-brackets", db: db() });
    expect(page).toMatchObject({ rows: [], total: 0, filter: { slug: "valid-brackets", title: "Valid Brackets" } });
  });

  it("a user without submits gets an empty first page", async () => {
    const page = await getSubmissionHistory({ userId: carol.id, page: 1, pageSize: 10, db: db() });
    expect(page).toMatchObject({ rows: [], total: 0, page: 1 });
  });
});

describe("getProblemSubmissions (AC-M6-3)", () => {
  it("returns the user's latest submits for that problem only, capped", async () => {
    const rows = await getProblemSubmissions({ userId: alice.id, slug: "two-sum", limit: 5, db: db() });
    expect(rows).toHaveLength(5);
    expect(rows[0].id).toBe(waId);
    expect(rows.every((r) => r.problem.slug === "two-sum")).toBe(true);
    expect(rows.map((r) => r.id)).not.toContain(aliceRun);
    expect(await getProblemSubmissions({ userId: carol.id, slug: "two-sum", db: db() })).toEqual([]);
  });

  it("is limited to 20 by default and ignores unpublished problems", async () => {
    expect((await getProblemSubmissions({ userId: alice.id, slug: "two-sum", db: db() })).length).toBe(17);
    expect(await getProblemSubmissions({ userId: alice.id, slug: "hidden-one", db: db() })).toEqual([]);
  });
});

describe("getSubmissionDetail (AC-M6-2 access control)", () => {
  it("returns the owner's submit with code, DTO and the stored failed case", async () => {
    const detail = await getSubmissionDetail({ userId: alice.id, id: waId, db: db() });
    expect(detail).not.toBeNull();
    expect(detail!.code).toBe("class Solution:\n    pass\n");
    expect(detail!.paramOrder).toEqual(["nums", "target"]);
    expect(detail!.problemPublished).toBe(true);
    expect(detail!.submission).toMatchObject({
      id: waId,
      kind: "submit",
      status: "wrong_answer",
      problem: { slug: "two-sum", title: "Two Sum" },
      passedCount: 3,
      totalCount: 10,
      stdout: "debug",
      failedCase: { input: { nums: [1, 2], target: 3 }, expected: [0, 1], actual: [1, 0] },
    });
  });

  it("truncates a huge failed case for display like the API DTO", async () => {
    const big = Array.from({ length: 20_000 }, (_, i) => i);
    const id = await sub(carol, "two-sum", "wrong_answer", 50, { failedCase: { input: { nums: big, target: 1 }, expected: [0, 1], actual: [] } });
    const detail = await getSubmissionDetail({ userId: carol.id, id, db: db() });
    expect(detail!.submission.failedCase).toMatchObject({ truncated: true, truncatedFields: ["input"] });
    expect(typeof detail!.submission.failedCase!.input).toBe("string");
  });

  it("is null for another user's submission, a run, an unknown and a malformed id", async () => {
    expect(await getSubmissionDetail({ userId: bob.id, id: waId, db: db() })).toBeNull();
    expect(await getSubmissionDetail({ userId: alice.id, id: bobSubmit, db: db() })).toBeNull();
    expect(await getSubmissionDetail({ userId: alice.id, id: aliceRun, db: db() })).toBeNull();
    expect(await getSubmissionDetail({ userId: alice.id, id: "00000000-0000-4000-8000-000000000000", db: db() })).toBeNull();
    for (const bad of ["not-a-uuid", "", "1 or 1=1", `${waId}x`]) {
      expect(await getSubmissionDetail({ userId: alice.id, id: bad, db: db() })).toBeNull();
    }
  });
});

describe("query budget", () => {
  let pool: Pool;
  let logged: string[];
  let loggingDb: Db;

  beforeAll(() => {
    pool = new Pool({ connectionString: testDbUrl() });
    logged = [];
    loggingDb = drizzle(pool, { schema, logger: { logQuery: (query) => logged.push(query) } });
  });
  afterAll(async () => {
    await pool.end();
  });

  it("history: one query for any page, filter or page size", async () => {
    for (const args of [
      { page: 1, pageSize: 20 },
      { page: 2, pageSize: 10 },
      { page: 99, pageSize: 10 },
      { page: 1, pageSize: 100, problemSlug: "two-sum" },
      { page: 1, pageSize: 20, problemSlug: "no-such-problem" },
    ]) {
      logged = [];
      await getSubmissionHistory({ userId: alice.id, db: loggingDb, ...args });
      expect(logged).toHaveLength(1);
    }
  });

  it("malformed slug: no query at all", async () => {
    logged = [];
    await getSubmissionHistory({ userId: alice.id, page: 1, pageSize: 20, problemSlug: "UPPER", db: loggingDb });
    expect(logged).toHaveLength(0);
  });

  it("problem tab and detail: one query each", async () => {
    logged = [];
    await getProblemSubmissions({ userId: alice.id, slug: "two-sum", db: loggingDb });
    expect(logged).toHaveLength(1);
    logged = [];
    await getSubmissionDetail({ userId: alice.id, id: waId, db: loggingDb });
    expect(logged).toHaveLength(1);
  });
});
