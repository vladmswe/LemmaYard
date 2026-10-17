// A user's solved / submission statistics (AC-M6-4, AC-M6-5), shared by the
// profile and the landing progress card so both show the same numbers. One
// query; the counting rules live in `summarizeUserStats` (src/lib/progress.ts).
import { and, eq, min, sql } from "drizzle-orm";

import { summarizeUserStats, type SubmissionGroup, type UserStats } from "@/lib/progress";
import { type Db, getDb } from "@/server/db";
import { problems, submissions } from "@/server/db/schema";

/** The user's submit rows grouped by problem and status (one query). */
export async function getSubmissionGroups(userId: string, db: Db = getDb()): Promise<SubmissionGroup[]> {
  const rows = await db
    .select({
      problemId: submissions.problemId,
      slug: problems.slug,
      title: problems.title,
      difficulty: problems.difficulty,
      published: problems.published,
      kind: submissions.kind,
      status: submissions.status,
      count: sql<number>`count(*)::int`,
      firstAt: min(submissions.createdAt),
    })
    .from(submissions)
    .innerJoin(problems, eq(problems.id, submissions.problemId))
    .where(and(eq(submissions.userId, userId), eq(submissions.kind, "submit"), eq(problems.published, true)))
    .groupBy(
      submissions.problemId,
      problems.slug,
      problems.title,
      problems.difficulty,
      problems.published,
      submissions.kind,
      submissions.status,
    );
  return rows.map((r) => ({ ...r, firstAt: r.firstAt ?? new Date(0) }));
}

/** Solved by difficulty, counted submits, acceptance and recently solved (one query). */
export async function getUserStats(userId: string, db: Db = getDb()): Promise<UserStats> {
  return summarizeUserStats(await getSubmissionGroups(userId, db));
}
