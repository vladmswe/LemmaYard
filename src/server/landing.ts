import { and, asc, count, eq, inArray, notInArray, sql } from "drizzle-orm";

import { NOT_COUNTED_STATUSES, type UserStats } from "@/lib/progress";
import { type Db, getDb } from "@/server/db";
import { languageEnum, problems, problemTags, submissions, tags, testCases } from "@/server/db/schema";
import { logError } from "@/server/log";
import { getUserStats } from "@/server/progress";

type Difficulty = (typeof problems.$inferSelect)["difficulty"];

/**
 * Featured problems on the landing page: a fixed, curated starter set that
 * spans the difficulties. Missing or unpublished slugs are skipped.
 */
export const FEATURED_SLUGS = [
  "two-sum",
  "valid-parentheses",
  "merge-intervals",
  "trapping-rain-water",
] as const;

export type CatalogStats = { total: number; byDifficulty: Record<Difficulty, number> };

/** Supported languages (the DB enum): the landing ledger counts them. */
export const LANGUAGE_COUNT = languageEnum.enumValues.length;

export type TestRange = { min: number; max: number };

/**
 * Fewest and most test cases (all cases, samples included: a submit runs
 * every one) of a published problem. Null when nothing is published.
 */
export async function getTestRange(db: Db = getDb()): Promise<TestRange | null> {
  const perProblem = db
    .select({ n: count().as("n") })
    .from(testCases)
    .innerJoin(problems, eq(problems.id, testCases.problemId))
    .where(eq(problems.published, true))
    .groupBy(testCases.problemId)
    .as("per_problem");
  const [row] = await db
    .select({
      min: sql<number | null>`min(${perProblem.n})`.mapWith((v) => (v === null ? null : Number(v))),
      max: sql<number | null>`max(${perProblem.n})`.mapWith((v) => (v === null ? null : Number(v))),
    })
    .from(perProblem);
  if (!row || row.min === null || row.max === null) return null;
  return { min: row.min, max: row.max };
}

/** Published problem counts, total and by difficulty (one query). */
export async function getCatalogStats(db: Db = getDb()): Promise<CatalogStats> {
  const rows = await db
    .select({ difficulty: problems.difficulty, n: count() })
    .from(problems)
    .where(eq(problems.published, true))
    .groupBy(problems.difficulty);
  const byDifficulty: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
  for (const row of rows) byDifficulty[row.difficulty] = row.n;
  return { total: byDifficulty.easy + byDifficulty.medium + byDifficulty.hard, byDifficulty };
}

export type FeaturedProblem = {
  number: number;
  slug: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  /** Accepted / counted submits; null when there are no counted submits. */
  acceptance: number | null;
};

/** The featured problems with tags and real acceptance (3 queries). */
export async function getFeaturedProblems(): Promise<FeaturedProblem[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: problems.id,
      number: problems.number,
      slug: problems.slug,
      title: problems.title,
      difficulty: problems.difficulty,
    })
    .from(problems)
    .where(and(eq(problems.published, true), inArray(problems.slug, [...FEATURED_SLUGS])))
    .orderBy(asc(problems.number));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [tagRows, accRows] = await Promise.all([
    db
      .select({ problemId: problemTags.problemId, name: tags.name })
      .from(problemTags)
      .innerJoin(tags, eq(tags.id, problemTags.tagId))
      .where(inArray(problemTags.problemId, ids))
      .orderBy(asc(tags.name)),
    db
      .select({
        problemId: submissions.problemId,
        total: count(),
        accepted: sql<number>`count(*) filter (where ${submissions.status} = 'accepted')`.mapWith(
          Number,
        ),
      })
      .from(submissions)
      .where(
        and(
          inArray(submissions.problemId, ids),
          eq(submissions.kind, "submit"),
          notInArray(submissions.status, [...NOT_COUNTED_STATUSES]),
        ),
      )
      .groupBy(submissions.problemId),
  ]);

  return rows.map((r) => {
    const acc = accRows.find((a) => a.problemId === r.id);
    return {
      number: r.number,
      slug: r.slug,
      title: r.title,
      difficulty: r.difficulty,
      tags: tagRows.filter((t) => t.problemId === r.id).map((t) => t.name),
      acceptance: acc && acc.total > 0 ? acc.accepted / acc.total : null,
    };
  });
}

/**
 * The signed-in user's numbers on the landing card: the profile's helper
 * (`getUserStats`, src/server/progress.ts), so both pages always agree.
 */
export type UserProgress = Pick<UserStats, "solved" | "solvedTotal" | "submits" | "acceptance">;

export type LandingData = {
  /** Null when the database is unavailable: the page then shows no numbers. */
  stats: CatalogStats | null;
  /** Test cases per published problem; null without data. */
  tests: TestRange | null;
  featured: FeaturedProblem[];
  progress: UserProgress | null;
};

/**
 * Everything the landing page reads from the database. A database failure is
 * logged (without connection details) and degrades to "no data" instead of
 * failing the page.
 */
export async function getLandingData(userId: string | null): Promise<LandingData> {
  try {
    const [stats, tests, featured, progress] = await Promise.all([
      getCatalogStats(),
      getTestRange(),
      getFeaturedProblems(),
      userId ? getUserStats(userId) : Promise.resolve(null),
    ]);
    return { stats, tests, featured, progress };
  } catch (error) {
    logError("landing.db_unavailable", error);
    return { stats: null, tests: null, featured: [], progress: null };
  }
}

export type LemmaOfTheDay = Pick<FeaturedProblem, "number" | "slug" | "title" | "difficulty" | "tags">;

/**
 * "Lemma of the day" on the login page: one published problem per UTC day,
 * rotating through the catalog by number. Null without data or when the
 * database is unavailable (the panel then shows its static copy).
 */
export async function getLemmaOfTheDay(now: Date = new Date()): Promise<LemmaOfTheDay | null> {
  try {
    const db = getDb();
    const rows = await db
      .select({
        id: problems.id,
        number: problems.number,
        slug: problems.slug,
        title: problems.title,
        difficulty: problems.difficulty,
      })
      .from(problems)
      .where(eq(problems.published, true))
      .orderBy(asc(problems.number));
    if (rows.length === 0) return null;
    const day = Math.floor(now.getTime() / 86_400_000);
    const pick = rows[day % rows.length];
    const tagRows = await db
      .select({ name: tags.name })
      .from(problemTags)
      .innerJoin(tags, eq(tags.id, problemTags.tagId))
      .where(eq(problemTags.problemId, pick.id))
      .orderBy(asc(tags.name));
    return {
      number: pick.number,
      slug: pick.slug,
      title: pick.title,
      difficulty: pick.difficulty,
      tags: tagRows.map((t) => t.name),
    };
  } catch (error) {
    logError("login.lemma_unavailable", error);
    return null;
  }
}
