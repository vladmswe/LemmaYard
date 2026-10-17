import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { problems, problemTags, submissions, tags, testCases, users } from "@/server/db/schema";

import {
  closeTestDb,
  createProblem,
  createSubmission,
  createTestCases,
  createUser,
  getTestDb,
  resetTestDb,
  testDbName,
} from "../helpers/db";

/** Postgres error code of a failed Drizzle query (wrapped in `cause`). */
async function pgCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string; constraint?: string } };
    return e.cause?.code ?? e.code ?? "unknown";
  }
  throw new Error("expected the query to fail");
}

const UNIQUE = "23505";
const CHECK = "23514";
const FK = "23503";
const ENUM = "22P02";

beforeEach(resetTestDb);
afterAll(closeTestDb);

describe("test database", () => {
  it("is an isolated leetcopy_test_<suffix> database", async () => {
    const { rows } = await getTestDb().execute<{ db: string }>(sql`SELECT current_database() AS db`);
    expect(rows[0].db).toBe(testDbName());
    expect(rows[0].db).toMatch(/^leetcopy_test_[a-z0-9_]+$/);
  });

  it("starts every test empty", async () => {
    const db = getTestDb();
    for (const table of [users, problems, tags, problemTags, testCases, submissions]) {
      expect(await db.$count(table)).toBe(0);
    }
  });
});

describe("uniqueness", () => {
  it("users.email and users.username", async () => {
    await createUser({ email: "a@example.com", username: "alice" });
    expect(await pgCode(createUser({ email: "a@example.com", username: "bob" }))).toBe(UNIQUE);
    expect(await pgCode(createUser({ email: "b@example.com", username: "alice" }))).toBe(UNIQUE);
  });

  it("problems.number and problems.slug", async () => {
    await createProblem({ number: 1, slug: "two-sum" });
    expect(await pgCode(createProblem({ number: 1, slug: "other" }))).toBe(UNIQUE);
    expect(await pgCode(createProblem({ number: 2, slug: "two-sum" }))).toBe(UNIQUE);
  });

  it("tags.slug, problem_tags pk and test_cases(problem_id, position)", async () => {
    const problem = await createProblem({ tags: ["array"] });
    const db = getTestDb();
    expect(await pgCode(db.insert(tags).values({ slug: "array", name: "Array" }))).toBe(UNIQUE);
    const [tag] = await db.select().from(tags);
    expect(await pgCode(db.insert(problemTags).values({ problemId: problem.id, tagId: tag.id }))).toBe(UNIQUE);
    await createTestCases(problem.id, 1);
    expect(await pgCode(createTestCases(problem.id, 1))).toBe(UNIQUE);
  });
});

describe("CHECK constraints", () => {
  it("email must be lowercase and username must match [a-z0-9_]{3,20}", async () => {
    expect(await pgCode(createUser({ email: "Mixed@Example.com" }))).toBe(CHECK);
    expect(await pgCode(createUser({ username: "ab" }))).toBe(CHECK);
    expect(await pgCode(createUser({ username: "Upper" }))).toBe(CHECK);
    expect(await pgCode(createUser({ username: "a".repeat(21) }))).toBe(CHECK);
    expect(await pgCode(createUser({ username: "has-dash" }))).toBe(CHECK);
    await expect(createUser({ username: "ok_name_1" })).resolves.toBeDefined();
  });

  it("problem limits and numbers are positive, positions non-negative", async () => {
    expect(await pgCode(createProblem({ number: 0 }))).toBe(CHECK);
    expect(await pgCode(createProblem({ timeLimitMs: 0 }))).toBe(CHECK);
    expect(await pgCode(createProblem({ memoryLimitMb: -1 }))).toBe(CHECK);
    const problem = await createProblem();
    expect(await pgCode(createTestCases(problem.id, 1, { position: -1 }))).toBe(CHECK);
  });

  it("submission counts: 0 <= passed <= total", async () => {
    const user = await createUser();
    const problem = await createProblem();
    const ids = { userId: user.id, problemId: problem.id };
    expect(await pgCode(createSubmission({ ...ids, passedCount: 3, totalCount: 2 }))).toBe(CHECK);
    expect(await pgCode(createSubmission({ ...ids, passedCount: -1 }))).toBe(CHECK);
    await expect(createSubmission({ ...ids, passedCount: 2, totalCount: 2 })).resolves.toBeDefined();
  });

  it("running needs started_at; final statuses need finished_at", async () => {
    const user = await createUser();
    const problem = await createProblem();
    const ids = { userId: user.id, problemId: problem.id };
    const now = new Date();
    expect(await pgCode(createSubmission({ ...ids, status: "running" }))).toBe(CHECK);
    await expect(createSubmission({ ...ids, status: "running", startedAt: now })).resolves.toBeDefined();
    await expect(createSubmission({ ...ids, status: "queued" })).resolves.toBeDefined();
    for (const status of [
      "accepted",
      "wrong_answer",
      "time_limit",
      "memory_limit",
      "runtime_error",
      "compile_error",
      "internal_error",
    ] as const) {
      expect(await pgCode(createSubmission({ ...ids, status, startedAt: now }))).toBe(CHECK);
      await expect(
        createSubmission({ ...ids, status, startedAt: now, finishedAt: now }),
      ).resolves.toBeDefined();
    }
  });

  it("runtime_ms and memory_kb are non-negative when set", async () => {
    const user = await createUser();
    const problem = await createProblem();
    const ids = { userId: user.id, problemId: problem.id };
    expect(await pgCode(createSubmission({ ...ids, runtimeMs: -1 }))).toBe(CHECK);
    expect(await pgCode(createSubmission({ ...ids, memoryKb: -1 }))).toBe(CHECK);
    await expect(createSubmission({ ...ids, runtimeMs: 0, memoryKb: 0 })).resolves.toBeDefined();
  });

  it("failed_test_index is within [0, total_count)", async () => {
    const user = await createUser();
    const problem = await createProblem();
    const ids = { userId: user.id, problemId: problem.id, totalCount: 3 };
    expect(await pgCode(createSubmission({ ...ids, failedTestIndex: -1 }))).toBe(CHECK);
    expect(await pgCode(createSubmission({ ...ids, failedTestIndex: 3 }))).toBe(CHECK);
    expect(await pgCode(createSubmission({ ...ids, totalCount: 0, failedTestIndex: 0 }))).toBe(CHECK);
    await expect(createSubmission({ ...ids, failedTestIndex: 2 })).resolves.toBeDefined();
    await expect(createSubmission({ ...ids, failedTestIndex: null })).resolves.toBeDefined();
  });
});

describe("enums", () => {
  it("reject unknown difficulty, kind, language and status", async () => {
    const db = getTestDb();
    const user = await createUser();
    const problem = await createProblem();
    expect(
      await pgCode(db.execute(sql`UPDATE problems SET difficulty = 'impossible' WHERE id = ${problem.id}`)),
    ).toBe(ENUM);
    const submission = await createSubmission({ userId: user.id, problemId: problem.id });
    for (const [column, value] of [
      ["kind", "debug"],
      ["language", "ruby"],
      ["status", "pending"],
    ]) {
      expect(
        await pgCode(
          db.execute(sql`UPDATE submissions SET ${sql.identifier(column)} = ${value} WHERE id = ${submission.id}`),
        ),
      ).toBe(ENUM);
    }
  });

  it("submissions default to queued with zero counts and null results", async () => {
    const user = await createUser();
    const problem = await createProblem();
    const s = await createSubmission({ userId: user.id, problemId: problem.id, kind: "run" });
    expect(s).toMatchObject({
      status: "queued",
      passedCount: 0,
      totalCount: 0,
      runtimeMs: null,
      memoryKb: null,
      failedTestIndex: null,
      failedCase: null,
      caseResults: null,
      customInput: null,
      workerId: null,
      startedAt: null,
      finishedAt: null,
    });
    expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("stores jsonb results round-trip", async () => {
    const user = await createUser();
    const problem = await createProblem();
    const s = await createSubmission({
      userId: user.id,
      problemId: problem.id,
      status: "wrong_answer",
      startedAt: new Date(),
      finishedAt: new Date(),
      passedCount: 3,
      totalCount: 5,
      failedTestIndex: 3,
      failedCase: { input: { x: 1 }, expected: [1, 2], actual: null },
      caseResults: [
        { index: 0, status: "passed", input: { x: 1 }, expected: 1, actual: 1, timeMs: 4 },
        { index: 1, status: "runtime_error", input: { x: 2 }, error: "ZeroDivisionError" },
        { index: 2, status: "not_run", input: { x: 3 } },
      ],
      customInput: { x: 9007199254740991 },
    });
    const [row] = await getTestDb().select().from(submissions).where(eq(submissions.id, s.id));
    expect(row.failedCase).toEqual({ input: { x: 1 }, expected: [1, 2], actual: null });
    expect(row.caseResults?.[0].timeMs).toBe(4);
    expect(row.caseResults?.[1]).toEqual({
      index: 1,
      status: "runtime_error",
      input: { x: 2 },
      error: "ZeroDivisionError",
    });
    expect(row.customInput).toEqual({ x: 9007199254740991 });
  });
});

describe("foreign keys and cascades", () => {
  it("deleting a problem removes its test cases, tag links and submissions, not tags", async () => {
    const db = getTestDb();
    const user = await createUser();
    const problem = await createProblem({ tags: ["array", "math"] });
    await createTestCases(problem.id, 5);
    await createSubmission({ userId: user.id, problemId: problem.id });

    await db.delete(problems).where(eq(problems.id, problem.id));
    expect(await db.$count(testCases)).toBe(0);
    expect(await db.$count(problemTags)).toBe(0);
    expect(await db.$count(submissions)).toBe(0);
    expect(await db.$count(tags)).toBe(2);
    expect(await db.$count(users)).toBe(1);
  });

  it("deleting a user removes their submissions; deleting a tag removes its links", async () => {
    const db = getTestDb();
    const user = await createUser();
    const other = await createUser();
    const problem = await createProblem({ tags: ["array"] });
    await createSubmission({ userId: user.id, problemId: problem.id });
    await createSubmission({ userId: other.id, problemId: problem.id });

    await db.delete(users).where(eq(users.id, user.id));
    expect(await db.$count(submissions)).toBe(1);

    await db.delete(tags);
    expect(await db.$count(problemTags)).toBe(0);
    expect(await db.$count(problems)).toBe(1);
  });

  it("rejects rows pointing at missing parents", async () => {
    const missing = "00000000-0000-0000-0000-000000000000";
    const user = await createUser();
    expect(await pgCode(createSubmission({ userId: user.id, problemId: missing }))).toBe(FK);
    expect(await pgCode(createTestCases(missing, 1))).toBe(FK);
  });
});

describe("indexes", () => {
  it("has the plan's indexes including the partial ones", async () => {
    const { rows } = await getTestDb().execute<{ indexname: string; indexdef: string }>(
      sql`SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const defs = Object.fromEntries(rows.map((r) => [r.indexname, r.indexdef]));
    expect(defs.submissions_user_created_idx).toMatch(/\(user_id, created_at DESC( NULLS LAST)?\)/);
    expect(defs.submissions_problem_kind_status_idx).toMatch(/\(problem_id, kind, status\)/);
    expect(defs.submissions_queued_idx).toMatch(/\(created_at\) WHERE \(status = 'queued'/);
    expect(defs.submissions_running_idx).toMatch(/\(status, started_at\) WHERE \(status = 'running'/);
    expect(defs.problems_difficulty_idx).toMatch(/\(difficulty\)/);
    expect(defs.problems_published_idx).toMatch(/\(published\)/);
    // Migration 0001.
    expect(defs.submissions_user_active_idx).toMatch(
      /\(user_id\) WHERE \(status = ANY \(ARRAY\['queued'::submission_status, 'running'::submission_status\]\)\)/,
    );
    expect(defs.submissions_run_created_idx).toMatch(/\(created_at\) WHERE \(kind = 'run'/);
    expect(defs.submissions_user_problem_created_idx).toMatch(
      /\(user_id, problem_id, created_at DESC( NULLS LAST)?\)/,
    );
    expect(defs.problem_tags_tag_idx).toMatch(/ON public\.problem_tags USING btree \(tag_id\)/);
  });
});
