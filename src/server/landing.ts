import { and, asc, count, countDistinct, eq, inArray, notInArray, sql } from "drizzle-orm";

import { getDb } from "@/server/db";
import { logError } from "@/server/log";
import { problems, problemTags, submissions, tags } from "@/server/db/schema";

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

/** Submit verdicts that count for acceptance (AC-M3-3: all but internal_error; pending excluded). */
const NOT_COUNTED = ["internal_error", "queued", "running"] as const;

export type CatalogStats = { total: number; byDifficulty: Record<Difficulty, number> };

/** Published problem counts, total and by difficulty (one query). */
export async function getCatalogStats(): Promise<CatalogStats> {
  const rows = await getDb()
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
          notInArray(submissions.status, [...NOT_COUNTED]),
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

export type UserProgress = {
  solved: Record<Difficulty, number>;
  solvedTotal: number;
  submits: number;
  /** Accepted / counted submits; null without counted submits. */
  acceptance: number | null;
};

/** A user's real progress for the landing preview card (2 queries). */
export async function getUserProgress(userId: string): Promise<UserProgress> {
  const db = getDb();
  const [solvedRows, [submitRow]] = await Promise.all([
    db
      .select({ difficulty: problems.difficulty, n: countDistinct(submissions.problemId) })
      .from(submissions)
      .innerJoin(problems, eq(problems.id, submissions.problemId))
      .where(
        and(
          eq(submissions.userId, userId),
          eq(submissions.kind, "submit"),
          eq(submissions.status, "accepted"),
          eq(problems.published, true),
        ),
      )
      .groupBy(problems.difficulty),
    db
      .select({
        total: count(),
        accepted: sql<number>`count(*) filter (where ${submissions.status} = 'accepted')`.mapWith(
          Number,
        ),
      })
      .from(submissions)
      .where(
        and(
          eq(submissions.userId, userId),
          eq(submissions.kind, "submit"),
          notInArray(submissions.status, [...NOT_COUNTED]),
        ),
      ),
  ]);
  const solved: Record<Difficulty, number> = { easy: 0, medium: 0, hard: 0 };
  for (const row of solvedRows) solved[row.difficulty] = row.n;
  const submits = submitRow?.total ?? 0;
  return {
    solved,
    solvedTotal: solved.easy + solved.medium + solved.hard,
    submits,
    acceptance: submits > 0 ? (submitRow?.accepted ?? 0) / submits : null,
  };
}

export type LandingData = {
  /** Null when the database is unavailable: the page then shows no numbers. */
  stats: CatalogStats | null;
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
    const [stats, featured, progress] = await Promise.all([
      getCatalogStats(),
      getFeaturedProblems(),
      userId ? getUserProgress(userId) : Promise.resolve(null),
    ]);
    return { stats, featured, progress };
  } catch (error) {
    logError("landing.db_unavailable", error);
    return { stats: null, featured: [], progress: null };
  }
}
