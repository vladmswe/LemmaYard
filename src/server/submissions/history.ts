// Submission history (AC-M6-1..3). Only the signed-in user's own `submit`
// rows are ever read here (runs are never history, PLAN §4 / AC-M5-9), and
// every query is scoped by `user_id`: another user's id simply finds nothing.
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";

import { isValidSlug, PROBLEM_TAB_LIMIT } from "@/lib/submissions/history";
import type { Language, SubmissionDto, SubmissionStatus } from "@/lib/submission-dto";
import { type Db, getDb } from "@/server/db";
import { problems, submissions, users } from "@/server/db/schema";

import { toSubmissionDto } from "./serialize";

export type HistoryRow = {
  id: string;
  createdAt: Date;
  language: Language;
  status: SubmissionStatus;
  runtimeMs: number | null;
  memoryKb: number | null;
  /** Hidden tests passed / total (the row's test squares). */
  passedCount: number;
  totalCount: number;
  problem: { slug: string; title: string; published: boolean };
};

export type HistoryPage = {
  rows: HistoryRow[];
  /** The user's submits matching the filter (all pages). */
  total: number;
  page: number;
  pageSize: number;
  /**
   * The `?problem=` filter: null when unset; `title: null` when the slug is
   * not a known problem (the page shows an empty state).
   */
  filter: { slug: string; title: string | null } | null;
};

function ownSubmits(userId: string, problemSlug?: string): SQL {
  return and(
    eq(submissions.userId, userId),
    eq(submissions.kind, "submit"),
    problemSlug === undefined ? undefined : eq(problems.slug, problemSlug),
  )!;
}

/**
 * One page of the user's submits, newest first, in ONE statement: a meta row
 * (filtered total, filter title) anchored on the user's row, LEFT JOINed with
 * the page rows so totals survive an empty page (no matches, page past end).
 */
export async function getSubmissionHistory({
  userId,
  page,
  pageSize,
  problemSlug,
  db = getDb(),
}: {
  userId: string;
  page: number;
  pageSize: number;
  problemSlug?: string;
  db?: Db;
}): Promise<HistoryPage> {
  if (problemSlug !== undefined && !isValidSlug(problemSlug)) {
    return { rows: [], total: 0, page, pageSize, filter: { slug: problemSlug, title: null } };
  }
  const where = ownSubmits(userId, problemSlug);

  const meta = db
    .select({
      // Aliased tables: inside this single-table select Drizzle would leave
      // `${column}` unqualified, and a bare "id" is ambiguous in the join.
      total: sql<number>`(
        select count(*)::int from ${submissions} s
        inner join ${problems} p on p.id = s.problem_id
        where s.user_id = ${userId} and s.kind = 'submit'
          ${problemSlug === undefined ? sql`` : sql`and p.slug = ${problemSlug}`}
      )`.as("total"),
      filterTitle: (problemSlug === undefined
        ? sql<string | null>`null::text`
        : sql<string | null>`(select p.title from ${problems} p where p.slug = ${problemSlug})`
      ).as("filter_title"),
    })
    .from(users)
    .where(eq(users.id, userId))
    .as("meta");

  const rows = db
    .select({
      id: submissions.id,
      createdAt: submissions.createdAt,
      language: submissions.language,
      status: submissions.status,
      runtimeMs: submissions.runtimeMs,
      memoryKb: submissions.memoryKb,
      passedCount: submissions.passedCount,
      totalCount: submissions.totalCount,
      slug: problems.slug,
      title: problems.title,
      published: problems.published,
    })
    .from(submissions)
    .innerJoin(problems, eq(problems.id, submissions.problemId))
    .where(where)
    .orderBy(desc(submissions.createdAt), desc(submissions.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .as("page");

  const result = await db
    .select({
      total: meta.total,
      filterTitle: meta.filterTitle,
      id: rows.id,
      createdAt: rows.createdAt,
      language: rows.language,
      status: rows.status,
      runtimeMs: rows.runtimeMs,
      memoryKb: rows.memoryKb,
      passedCount: rows.passedCount,
      totalCount: rows.totalCount,
      slug: rows.slug,
      title: rows.title,
      published: rows.published,
    })
    .from(meta)
    .leftJoin(rows, sql`true`)
    .orderBy(desc(rows.createdAt), desc(rows.id));

  const head = result[0];
  return {
    rows: result.flatMap((r) =>
      r.id === null
        ? []
        : [
            {
              id: r.id,
              createdAt: r.createdAt!,
              language: r.language!,
              status: r.status!,
              runtimeMs: r.runtimeMs,
              memoryKb: r.memoryKb,
              passedCount: r.passedCount ?? 0,
              totalCount: r.totalCount ?? 0,
              problem: { slug: r.slug!, title: r.title!, published: r.published! },
            },
          ],
    ),
    total: head?.total ?? 0,
    page,
    pageSize,
    filter: problemSlug === undefined ? null : { slug: problemSlug, title: head?.filterTitle ?? null },
  };
}

/** The user's latest submits for one published problem (problem page tab, one query). */
export async function getProblemSubmissions({
  userId,
  slug,
  limit = PROBLEM_TAB_LIMIT,
  db = getDb(),
}: {
  userId: string;
  slug: string;
  limit?: number;
  db?: Db;
}): Promise<HistoryRow[]> {
  const rows = await db
    .select({
      id: submissions.id,
      createdAt: submissions.createdAt,
      language: submissions.language,
      status: submissions.status,
      runtimeMs: submissions.runtimeMs,
      memoryKb: submissions.memoryKb,
      passedCount: submissions.passedCount,
      totalCount: submissions.totalCount,
      slug: problems.slug,
      title: problems.title,
      published: problems.published,
    })
    .from(submissions)
    .innerJoin(problems, eq(problems.id, submissions.problemId))
    .where(and(ownSubmits(userId, slug), eq(problems.published, true)))
    .orderBy(desc(submissions.createdAt), desc(submissions.id))
    .limit(limit);
  return rows.map(({ slug: s, title, published, ...r }) => ({ ...r, problem: { slug: s, title, published } }));
}

const idSchema = z.uuid();

export type SubmissionDetail = {
  submission: SubmissionDto;
  /** The owner's code (only ever shown to the owner). */
  code: string;
  /** Signature parameter names, for the failed-case Input block. */
  paramOrder: string[];
  problemPublished: boolean;
};

/**
 * One of the user's own submits for `/submissions/[id]`, or null for an
 * unknown or malformed id, another user's submission and any `run` row (the
 * page answers 404 for all of them alike). One query.
 */
export async function getSubmissionDetail({
  userId,
  id,
  db = getDb(),
}: {
  userId: string;
  id: string;
  db?: Db;
}): Promise<SubmissionDetail | null> {
  if (!idSchema.safeParse(id).success) return null;
  const [row] = await db
    .select({
      id: submissions.id,
      kind: submissions.kind,
      status: submissions.status,
      language: submissions.language,
      code: submissions.code,
      customInput: submissions.customInput,
      passedCount: submissions.passedCount,
      totalCount: submissions.totalCount,
      runtimeMs: submissions.runtimeMs,
      memoryKb: submissions.memoryKb,
      error: submissions.error,
      stdout: submissions.stdout,
      caseResults: submissions.caseResults,
      failedCase: submissions.failedCase,
      createdAt: submissions.createdAt,
      finishedAt: submissions.finishedAt,
      problem: { slug: problems.slug, title: problems.title },
      published: problems.published,
      signature: problems.signature,
    })
    .from(submissions)
    .innerJoin(problems, eq(problems.id, submissions.problemId))
    .where(and(eq(submissions.id, id), eq(submissions.userId, userId), eq(submissions.kind, "submit")))
    .limit(1);
  if (!row) return null;
  const { code, published, signature, ...dtoRow } = row;
  return {
    submission: toSubmissionDto(dtoRow),
    code,
    paramOrder: (signature?.params ?? []).map((p) => p.name),
    problemPublished: published,
  };
}
