// Catalog and problem page data on fixtures (AC-M3-1..4, AC-M3-7): 48
// published + 2 unpublished problems and hand-placed submissions, inserted
// through Drizzle. Expected rows are computed from the fixture definitions.
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type CatalogFilters } from "@/lib/catalog/filters";
import { getCatalogPage } from "@/server/catalog";
import type { Db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { getProblemPageData } from "@/server/problem-page";

import {
  closeTestDb,
  createProblem,
  createSubmission,
  createTestCases,
  createUser,
  getTestDb,
  resetTestDb,
  testDbUrl,
} from "../helpers/db";

type Difficulty = "easy" | "medium" | "hard";
type Fixture = { number: number; title: string; difficulty: Difficulty; tags: string[]; published: boolean };

const SPECIAL_TITLES: Record<number, string> = {
  5: "Two Sum Variant",
  17: "Sum of Squares",
  30: "Discount 100% Off",
  40: "Snake_case Words",
};

const DIFFICULTY_BY_MOD: Difficulty[] = ["easy", "medium", "hard"];

function fixture(n: number, published = true): Fixture {
  const tags: string[] = [];
  if (n % 2 === 0) tags.push("array");
  if (n % 5 === 0) tags.push("string");
  if (n % 7 === 0) tags.push("dp");
  return {
    number: n,
    title: SPECIAL_TITLES[n] ?? `Fixture Problem ${String(n).padStart(2, "0")}`,
    difficulty: DIFFICULTY_BY_MOD[n % 3],
    tags,
    published,
  };
}

const PUBLISHED: Fixture[] = Array.from({ length: 48 }, (_, i) => fixture(i + 1));
const UNPUBLISHED: Fixture[] = [
  { number: 100, title: "Hidden Sum", difficulty: "easy", tags: ["array"], published: false },
  { number: 101, title: "Hidden Two", difficulty: "hard", tags: ["dp"], published: false },
];

const ids = new Map<number, string>();
let alice: { id: string };
let bob: { id: string };

const PAGE_SIZE = 20;
const db = () => getTestDb();
const page = (filters: Partial<CatalogFilters>, userId: string | null = null, pageSize = PAGE_SIZE) =>
  getCatalogPage({ filters: { page: 1, ...filters }, userId, pageSize, db: db() });
const numbers = (rows: { number: number }[]) => rows.map((r) => r.number);
const expectNumbers = (pred: (f: Fixture) => boolean) => PUBLISHED.filter(pred).map((f) => f.number);

beforeAll(async () => {
  await resetTestDb();
  for (const f of [...PUBLISHED, ...UNPUBLISHED]) {
    const row = await createProblem({
      number: f.number,
      slug: `fixture-${f.number}`,
      title: f.title,
      difficulty: f.difficulty,
      published: f.published,
      tags: f.tags,
    });
    ids.set(f.number, row.id);
  }
  alice = await createUser({ username: "alice" });
  bob = await createUser({ username: "bob" });

  const done = { finishedAt: new Date() };
  const sub = (user: { id: string }, n: number, status: (typeof schema.submissionStatusEnum.enumValues)[number], kind: "run" | "submit" = "submit") =>
    createSubmission({
      userId: user.id,
      problemId: ids.get(n)!,
      kind,
      status,
      ...(status === "queued" ? {} : status === "running" ? { startedAt: new Date() } : done),
    });

  // #1: 1 accepted of 3 counted submits; internal_error, queued and runs excluded.
  await sub(alice, 1, "accepted");
  await sub(alice, 1, "wrong_answer");
  await sub(bob, 1, "wrong_answer");
  await sub(bob, 1, "internal_error");
  await sub(bob, 1, "queued");
  await sub(alice, 1, "accepted", "run");
  await sub(bob, 1, "accepted", "run");
  // #2: alice attempted, 0 of 1.
  await sub(alice, 2, "time_limit");
  // #3: runs only -> no acceptance, alice still "todo".
  await sub(alice, 3, "accepted", "run");
  await sub(alice, 3, "wrong_answer", "run");
  // #4: only an internal error -> no acceptance; alice has a submit -> attempted.
  await sub(alice, 4, "internal_error");
  // #5: bob solved, alice untouched.
  await sub(bob, 5, "accepted");
  // Unpublished #100: alice's accepted must not leak into progress.
  await sub(alice, 100, "accepted");
});

afterAll(async () => {
  await resetTestDb();
  await closeTestDb();
});

describe("catalog pagination (AC-M3-1)", () => {
  it("returns the first page in number order with totals and tags", async () => {
    const data = await page({});
    expect(numbers(data.rows)).toEqual(expectNumbers((f) => f.number <= 20));
    expect(data.total).toBe(48);
    expect(data.page).toBe(1);
    expect(data.pageSize).toBe(PAGE_SIZE);
    expect(data.published).toEqual({ total: 48, byDifficulty: { easy: 16, medium: 16, hard: 16 } });
    // Unpublished problems do not count towards tags.
    expect(data.tags).toEqual([
      { slug: "array", name: "array", count: 24 },
      { slug: "dp", name: "dp", count: 6 },
      { slug: "string", name: "string", count: 9 },
    ]);
    expect(data.rows.find((r) => r.number === 14)?.tags).toEqual([
      { slug: "array", name: "array" },
      { slug: "dp", name: "dp" },
    ]);
    expect(data.rows.find((r) => r.number === 10)?.tags).toEqual([
      { slug: "array", name: "array" },
      { slug: "string", name: "string" },
    ]);
    expect(data.rows.find((r) => r.number === 1)?.tags).toEqual([]);
  });

  it("returns later pages and a short last page", async () => {
    expect(numbers((await page({ page: 2 })).rows)).toEqual(expectNumbers((f) => f.number > 20 && f.number <= 40));
    const last = await page({ page: 3 });
    expect(numbers(last.rows)).toEqual([41, 42, 43, 44, 45, 46, 47, 48]);
    expect(last.total).toBe(48);
  });

  it("keeps the total and tags on a page past the end", async () => {
    const data = await page({ page: 9 });
    expect(data.rows).toEqual([]);
    expect(data.total).toBe(48);
    expect(data.tags).toHaveLength(3);
  });

  it("honors the page size", async () => {
    const data = await page({ page: 2 }, null, 7);
    expect(numbers(data.rows)).toEqual([8, 9, 10, 11, 12, 13, 14]);
  });
});

describe("catalog filters (AC-M3-2)", () => {
  it("searches titles case-insensitively, published only", async () => {
    const data = await page({ q: "SUM" }, null, 100);
    expect(numbers(data.rows)).toEqual([5, 17]);
    expect(data.total).toBe(2);
    expect(numbers((await page({ q: "two sum" })).rows)).toEqual([5]);
    expect(numbers((await page({ q: "hidden" })).rows)).toEqual([]);
  });

  it("treats % and _ in the query literally", async () => {
    expect(numbers((await page({ q: "100%" })).rows)).toEqual([30]);
    expect(numbers((await page({ q: "%" })).rows)).toEqual([30]);
    expect(numbers((await page({ q: "_" })).rows)).toEqual([40]);
  });

  it("filters by difficulty", async () => {
    const data = await page({ difficulty: "hard" }, null, 100);
    expect(numbers(data.rows)).toEqual(expectNumbers((f) => f.difficulty === "hard"));
    expect(data.rows.every((r) => r.difficulty === "hard")).toBe(true);
    expect(data.total).toBe(16);
  });

  it("filters by tag", async () => {
    const data = await page({ tag: "dp" }, null, 100);
    expect(numbers(data.rows)).toEqual([7, 14, 21, 28, 35, 42]);
    expect(numbers((await page({ tag: "no-such-tag" })).rows)).toEqual([]);
  });

  it("combines filters", async () => {
    const data = await page({ difficulty: "easy", tag: "array", q: "fixture" }, null, 100);
    expect(numbers(data.rows)).toEqual(
      expectNumbers((f) => f.difficulty === "easy" && f.tags.includes("array") && /fixture/i.test(f.title)),
    );
    expect(data.rows.length).toBeGreaterThan(0);
    const paged = await page({ difficulty: "medium", tag: "array", page: 2 }, null, 3);
    expect(numbers(paged.rows)).toEqual(
      expectNumbers((f) => f.difficulty === "medium" && f.tags.includes("array")).slice(3, 6),
    );
  });

  it("returns an empty page with totals for no matches (empty state)", async () => {
    const data = await page({ q: "zzz-nothing", difficulty: "easy" });
    expect(data.rows).toEqual([]);
    expect(data.total).toBe(0);
    expect(data.published.total).toBe(48);
  });

  it("filters by the user's status", async () => {
    expect(numbers((await page({ status: "solved" }, alice.id)).rows)).toEqual([1]);
    expect(numbers((await page({ status: "attempted" }, alice.id)).rows)).toEqual([2, 4]);
    const todo = await page({ status: "todo" }, alice.id, 100);
    expect(todo.total).toBe(45);
    expect(numbers(todo.rows)).not.toContain(1);
    expect(numbers(todo.rows)).toContain(3);
    expect(numbers((await page({ status: "solved" }, bob.id)).rows)).toEqual([5]);
    expect(numbers((await page({ status: "attempted", difficulty: fixture(2).difficulty }, alice.id)).rows)).toEqual([2]);
  });

  it("ignores the status filter for guests without failing", async () => {
    const data = await page({ status: "solved" }, null);
    expect(data.total).toBe(48);
    expect(data.rows.every((r) => r.status === null)).toBe(true);
    expect(data.progress).toBeNull();
  });
});

describe("acceptance and status (AC-M3-3)", () => {
  it("computes acceptance from counted submits only", async () => {
    const rows = (await page({})).rows;
    const acc = (n: number) => rows.find((r) => r.number === n)!.acceptance;
    expect(acc(1)).toBeCloseTo(1 / 3);
    expect(acc(2)).toBe(0);
    expect(acc(3)).toBeNull();
    expect(acc(4)).toBeNull();
    expect(acc(5)).toBe(1);
    expect(acc(6)).toBeNull();
  });

  it("gives each user their own statuses", async () => {
    const forAlice = (await page({}, alice.id)).rows;
    const status = (rows: typeof forAlice, n: number) => rows.find((r) => r.number === n)!.status;
    expect(status(forAlice, 1)).toBe("solved");
    expect(status(forAlice, 2)).toBe("attempted");
    expect(status(forAlice, 3)).toBe("todo");
    expect(status(forAlice, 4)).toBe("attempted");
    expect(status(forAlice, 5)).toBe("todo");
    const forBob = (await page({}, bob.id)).rows;
    expect(status(forBob, 1)).toBe("attempted");
    expect(status(forBob, 5)).toBe("solved");
    // Acceptance is global, not per user.
    expect(forBob.find((r) => r.number === 1)!.acceptance).toBeCloseTo(1 / 3);
  });

  it("reports progress by difficulty over published problems", async () => {
    const data = await page({}, alice.id);
    expect(data.progress).toEqual({
      solved: { easy: 0, medium: 1, hard: 0 },
      attempted: 2,
    });
    expect(fixture(1).difficulty).toBe("medium");
  });

  it("guests get no statuses", async () => {
    const data = await page({});
    expect(data.rows.every((r) => r.status === null)).toBe(true);
  });
});

describe("query budget (AC-M3-7)", () => {
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

  async function count(filters: Partial<CatalogFilters>, userId: string | null, pageSize = PAGE_SIZE) {
    logged = [];
    const data = await getCatalogPage({ filters: { page: 1, ...filters }, userId, pageSize, db: loggingDb });
    return { data, queries: logged.length };
  }

  it("signed in: 3 queries (catalog page, statuses, acceptance)", async () => {
    const { data, queries } = await count({}, alice.id);
    expect(data.rows).toHaveLength(20);
    expect(queries).toBe(3);
  });

  it("guest: 2 queries", async () => {
    expect((await count({}, null)).queries).toBe(2);
  });

  it("does not grow with the page size (no N+1)", async () => {
    const { data, queries } = await count({}, alice.id, 100);
    expect(data.rows).toHaveLength(48);
    expect(queries).toBe(3);
  });

  it("stays within budget with every filter set", async () => {
    const { queries } = await count({ q: "fixture", difficulty: "easy", tag: "array", status: "todo" }, alice.id);
    expect(queries).toBeLessThanOrEqual(3);
  });

  it("skips the acceptance query for an empty page", async () => {
    expect((await count({ q: "zzz-nothing" }, alice.id)).queries).toBe(2);
  });
});

describe("problem page data (AC-M3-4, hidden tests)", () => {
  let slug: string;

  beforeAll(async () => {
    const problem = await createProblem({
      number: 500,
      slug: "with-tests",
      title: "With Tests",
      difficulty: "medium",
      descriptionMd: "Statement.\n\n## Constraints\n\n- `1 <= x`",
      tags: ["array", "dp"],
    });
    slug = problem.slug;
    // 2 samples (positions 0, 1) and 6 hidden tests with marker values.
    await createTestCases(problem.id, 2, { isSample: true });
    await getTestDb()
      .insert(schema.testCases)
      .values(
        Array.from({ length: 6 }, (_, i) => ({
          problemId: problem.id,
          position: 2 + i,
          input: { x: 9000 + i, secret: "HIDDEN_INPUT_MARKER" },
          expected: `HIDDEN_EXPECTED_MARKER_${i}`,
          isSample: false,
        })),
      );
    await createSubmission({ userId: alice.id, problemId: problem.id, status: "wrong_answer", finishedAt: new Date() });
  });

  it("returns only sample tests, in order", async () => {
    const data = await getProblemPageData(slug, null, getTestDb());
    expect(data).not.toBeNull();
    expect(data!.samples).toEqual([
      { input: { x: 0 }, expected: 0 },
      { input: { x: 1 }, expected: 1 },
    ]);
    const payload = JSON.stringify(data);
    expect(payload).not.toContain("HIDDEN_");
    expect(payload).not.toContain("9000");
  });

  it("returns the fields the page renders", async () => {
    const data = await getProblemPageData(slug, null, getTestDb());
    expect(data).toMatchObject({
      number: 500,
      slug: "with-tests",
      title: "With Tests",
      difficulty: "medium",
      descriptionMd: "Statement.\n\n## Constraints\n\n- `1 <= x`",
      tags: [
        { slug: "array", name: "array" },
        { slug: "dp", name: "dp" },
      ],
      status: null,
    });
    expect(Object.keys(data!).sort()).toEqual(
      ["descriptionMd", "difficulty", "number", "samples", "signature", "slug", "status", "tags", "title"].sort(),
    );
  });

  it("reports the user's status", async () => {
    expect((await getProblemPageData(slug, alice.id, getTestDb()))!.status).toBe("attempted");
    expect((await getProblemPageData(slug, bob.id, getTestDb()))!.status).toBe("todo");
    expect((await getProblemPageData("fixture-1", alice.id, getTestDb()))!.status).toBe("solved");
  });

  it("returns null for unknown and unpublished slugs (404)", async () => {
    expect(await getProblemPageData("no-such-problem", null, getTestDb())).toBeNull();
    expect(await getProblemPageData("fixture-100", alice.id, getTestDb())).toBeNull();
  });
});
