// Community C1 migration (docs/specs/community.md §C.1, §C.14): additive,
// new tables exist, generated columns compute, Wilson SQL/TS parity
// (AC-C-VT-3) and the CHECKs that keep threads two levels deep (AC-C-CM-1).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { wilsonLowerBound } from "@/lib/community/ranking";
import { MIGRATIONS_DIR } from "@/server/db/migrate";
import { comments, commentVotes, discussionThreads } from "@/server/db/schema";

import { ensureThread, hashOf, insertComment } from "../helpers/community";
import { closeTestDb, createProblem, createUser, getTestDb, resetTestDb } from "../helpers/db";

beforeEach(resetTestDb);
afterAll(closeTestDb);

const NEW_TABLES = [
  "comment_votes",
  "comments",
  "content_revisions",
  "discussion_threads",
  "moderation_actions",
  "problem_difficulty_feedback",
  "problem_votes",
  "reports",
];

function migrationFile(): string {
  const file = readdirSync(MIGRATIONS_DIR).find((f) => f.endsWith("_community_c1.sql"));
  expect(file).toBeDefined();
  return readFileSync(path.join(MIGRATIONS_DIR, file!), "utf8");
}

async function rejects(promise: Promise<unknown>, code = "23514") {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, "expected a constraint violation").not.toBeNull();
  const e = error as { code?: string; cause?: { code?: string } };
  expect(e.cause?.code ?? e.code).toBe(code);
}

describe("migration community_c1", () => {
  it("is one additive file (no DROP, no ALTER COLUMN) with RLS on every new table", () => {
    const migration = migrationFile();
    expect(migration).not.toMatch(/\bDROP\b/i);
    expect(migration).not.toMatch(/ALTER COLUMN/i);
    for (const t of NEW_TABLES) {
      expect(migration).toContain(`CREATE TABLE "${t}"`);
      expect(migration).toContain(`ALTER TABLE "${t}" ENABLE ROW LEVEL SECURITY;`);
    }
    for (const line of migration.split("\n").filter((l) => l.includes("ADD COLUMN"))) {
      expect(line).toMatch(/ADD COLUMN "\w+" ("?\w+"?|timestamp with time zone)( DEFAULT ('?\w+'?) NOT NULL)?;/);
    }
  });

  it("created every new table with row level security", async () => {
    const { rows } = await getTestDb().execute<{ name: string; rls: boolean }>(sql`
      SELECT c.relname AS name, c.relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname IN (${sql.join(NEW_TABLES.map((t) => sql`${t}`), sql`, `)})`);
    expect(rows.map((r) => r.name).sort()).toEqual(NEW_TABLES);
    expect(rows.every((r) => r.rls)).toBe(true);
  });

  it("users and problems get the new columns with defaults", async () => {
    const user = await createUser();
    const problem = await createProblem();
    expect(user).toMatchObject({ role: "user", communitySuspendedUntil: null });
    expect(problem).toMatchObject({ likeCount: 0, dislikeCount: 0 });
  });
});

describe("generated columns (AC-C-VT-3)", () => {
  const CASES: [number, number][] = [
    [0, 0],
    [1, 0],
    [0, 1],
    [5, 5],
    [100, 1],
    [1000, 10],
    [3, 7],
    [42, 13],
    [7, 0],
    [0, 250],
    [12345, 6789],
  ];

  it("rank_best equals wilsonLowerBound within 1e-9 and score = up - down", async () => {
    const problem = await createProblem();
    const author = await createUser();
    for (const [up, down] of CASES) {
      const c = await insertComment({ problemId: problem.id, authorId: author.id, up, down });
      const [row] = await getTestDb()
        .select({ rank: comments.rankBest, score: comments.score })
        .from(comments)
        .where(eq(comments.id, c.id));
      expect(row.score, `${up}/${down}`).toBe(up - down);
      expect(Math.abs(row.rank! - wilsonLowerBound(up, down)), `${up}/${down}`).toBeLessThan(1e-9);
    }
  });

  it("recomputes when the counters change", async () => {
    const problem = await createProblem();
    const c = await insertComment({ problemId: problem.id, authorId: null });
    await getTestDb().update(comments).set({ upCount: 9, downCount: 1 }).where(eq(comments.id, c.id));
    const [row] = await getTestDb().select({ rank: comments.rankBest, score: comments.score }).from(comments).where(eq(comments.id, c.id));
    expect(row.score).toBe(8);
    expect(Math.abs(row.rank! - wilsonLowerBound(9, 1))).toBeLessThan(1e-9);
  });
});

describe("CHECKs (AC-C-CM-1 and text rules)", () => {
  it("rejects depth 2, a parent/depth mismatch, control characters and two targets", async () => {
    const problem = await createProblem();
    const author = await createUser();
    const top = await insertComment({ problemId: problem.id, authorId: author.id });
    const threadId = await ensureThread(problem.id);
    const db = getTestDb();
    const base = { threadId, authorId: author.id, bodyMd: "x", bodyHash: hashOf("x") };
    await rejects(db.insert(comments).values({ ...base, parentId: top.id, depth: 2 }));
    await rejects(db.insert(comments).values({ ...base, parentId: null, depth: 1 }));
    await rejects(db.insert(comments).values({ ...base, parentId: top.id, depth: 0 }));
    await rejects(db.insert(comments).values({ ...base, depth: 0, bodyMd: "bell \x07" }));
    await rejects(db.insert(comments).values({ ...base, depth: 0, bodyHash: "nothex" }));
    await rejects(
      db.insert(discussionThreads).values({ kind: "problem", problemId: problem.id, lessonSlug: "arrays" }),
    );
    await rejects(db.insert(discussionThreads).values({ kind: "lesson", problemId: problem.id }));
    await rejects(db.insert(commentVotes).values({ commentId: top.id, userId: author.id, value: 2 }));
    // A tab and newlines are fine.
    await db.insert(comments).values({ ...base, depth: 0, bodyMd: "line\n\tindented\r\n" });
  });

  it("allows one thread per problem", async () => {
    const problem = await createProblem();
    await ensureThread(problem.id);
    await rejects(getTestDb().insert(discussionThreads).values({ kind: "problem", problemId: problem.id }), "23505");
  });

  it("never stores depth > 1", async () => {
    const { rows } = await getTestDb().execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM comments WHERE depth > 1`);
    expect(rows[0].n).toBe(0);
  });
});
