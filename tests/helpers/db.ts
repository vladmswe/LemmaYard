// Integration-test database helper (AC-M1-7).
//
// Each worktree/process gets its own database `leetcopy_test_<suffix>` on the
// TEST_DATABASE_URL server (fallback: DATABASE_URL). The suffix comes from
// TEST_DB_SUFFIX or the git worktree directory name. `ensureTestDatabase()`
// (run once from the Vitest global setup) creates it if missing and applies
// migrations; `resetTestDb()` empties every table between tests.
import { execFileSync } from "node:child_process";
import path from "node:path";

import { sql } from "drizzle-orm";

import { createDb, type Db } from "@/server/db";
import { runMigrations } from "@/server/db/migrate";
import {
  problems,
  problemTags,
  roomEvents,
  roomExternalProblems,
  roomMembers,
  rooms,
  roomSessionParticipants,
  roomSessionProblems,
  roomSessionResults,
  roomSessions,
  submissions,
  tags,
  testCases,
  users,
} from "@/server/db/schema";
import { getEnv } from "@/server/env";

import { TEST_DB_PREFIX, testDatabaseName, withDatabase } from "./test-db-name";

function worktreeName(): string {
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return path.basename(top);
  } catch {
    return path.basename(process.cwd());
  }
}

export function testDbName(): string {
  return testDatabaseName(getEnv().TEST_DB_SUFFIX ?? worktreeName());
}

export function testDbUrl(): string {
  const env = getEnv();
  return withDatabase(env.TEST_DATABASE_URL ?? env.DATABASE_URL, testDbName());
}

function pgErrorCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } };
  return e.code ?? e.cause?.code;
}

/** Creates the test database if it does not exist, then applies migrations. */
export async function ensureTestDatabase(): Promise<string> {
  const name = testDbName();
  const url = testDbUrl();
  const admin = createDb(withDatabase(url, "postgres"));
  try {
    const existing = await admin.db.execute(
      sql`SELECT 1 FROM pg_database WHERE datname = ${name}`,
    );
    if (existing.rows.length === 0) {
      try {
        // `name` is sanitized to [a-z0-9_], so quoting it is safe.
        await admin.db.execute(sql.raw(`CREATE DATABASE "${name}"`));
      } catch (error) {
        // 42P04 duplicate_database: created concurrently by another process.
        if (pgErrorCode(error) !== "42P04") throw error;
      }
    }
  } finally {
    await admin.pool.end();
  }
  await runMigrations(url);
  return name;
}

let client: ReturnType<typeof createDb> | undefined;

/** Shared Drizzle client for the test database. */
export function getTestDb(): Db {
  client ??= createDb(testDbUrl());
  return client.db;
}

export async function closeTestDb(): Promise<void> {
  await client?.pool.end();
  client = undefined;
}

/** Empties every application table (identities restarted). */
export async function resetTestDb(): Promise<void> {
  const db = getTestDb();
  const { rows } = await db.execute<{ current: string }>(
    sql`SELECT current_database() AS current`,
  );
  if (!rows[0].current.startsWith(TEST_DB_PREFIX)) {
    throw new Error(`refusing to truncate non-test database "${rows[0].current}"`);
  }
  await db.execute(
    sql`TRUNCATE ${roomEvents}, ${roomSessionResults}, ${roomSessionParticipants}, ${roomSessionProblems}, ${roomSessions}, ${roomExternalProblems}, ${roomMembers}, ${rooms}, ${submissions}, ${testCases}, ${problemTags}, ${tags}, ${problems}, ${users} RESTART IDENTITY CASCADE`,
  );
}

let seq = 0;
const next = () => ++seq;

type NewUser = typeof users.$inferInsert;
type NewProblem = typeof problems.$inferInsert;
type NewTestCase = typeof testCases.$inferInsert;
type NewSubmission = typeof submissions.$inferInsert;

export async function createUser(overrides: Partial<NewUser> = {}) {
  const n = next();
  const [row] = await getTestDb()
    .insert(users)
    .values({
      email: `user${n}@example.com`,
      username: `user_${n}`,
      passwordHash: "not-a-real-hash",
      ...overrides,
    })
    .returning();
  return row;
}

export async function createProblem(
  overrides: Partial<NewProblem> & { tags?: string[] } = {},
) {
  const { tags: tagSlugs = [], ...values } = overrides;
  const n = next();
  const db = getTestDb();
  const [row] = await db
    .insert(problems)
    .values({
      number: 10_000 + n,
      slug: `problem-${n}`,
      title: `Problem ${n}`,
      difficulty: "easy",
      descriptionMd: `Description ${n}`,
      signature: { name: "solve", params: [{ name: "x", type: "int" }], returns: "int" },
      compare: { mode: "exact" },
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      published: true,
      ...values,
    })
    .returning();
  for (const slug of tagSlugs) {
    const [tag] = await db
      .insert(tags)
      .values({ slug, name: slug })
      .onConflictDoUpdate({ target: tags.slug, set: { slug } })
      .returning();
    await db.insert(problemTags).values({ problemId: row.id, tagId: tag.id });
  }
  return row;
}

/** Inserts `count` test cases (input `{x: i}`, expected `i`), the first one a sample. */
export async function createTestCases(
  problemId: string,
  count = 5,
  overrides: Partial<NewTestCase> = {},
) {
  return getTestDb()
    .insert(testCases)
    .values(
      Array.from({ length: count }, (_, position) => ({
        problemId,
        position,
        input: { x: position },
        expected: position,
        isSample: position === 0,
        ...overrides,
      })),
    )
    .returning();
}

export async function createSubmission(
  values: Pick<NewSubmission, "userId" | "problemId"> & Partial<NewSubmission>,
) {
  const [row] = await getTestDb()
    .insert(submissions)
    .values({ kind: "submit", language: "python", code: "pass", ...values })
    .returning();
  return row;
}
