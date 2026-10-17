// Problem catalog data (AC-M3-1..3, AC-M3-7). One render costs at most three
// queries, independent of the page size:
//   1. catalog: published totals, tag list, filtered count and the page rows
//      (with their tags) in one statement;
//   2. the signed-in user's statuses (all problems they submitted to; also
//      feeds the progress card), in parallel with (1);
//   3. acceptance for the page rows, after (1).
import { and, asc, eq, exists, ilike, inArray, not, notInArray, sql, type SQL } from "drizzle-orm";

import {
  type CatalogDifficulty,
  type CatalogFilters,
  type CatalogStatus,
  escapeLike,
} from "@/lib/catalog/filters";
import { NOT_COUNTED_STATUSES } from "@/lib/progress";
import { type Db, getDb } from "@/server/db";
import { problems, problemTags, submissions, tags } from "@/server/db/schema";

/** Submit statuses left out of acceptance: internal errors and pending jobs (PLAN §4). */
export { NOT_COUNTED_STATUSES };

export type CatalogTag = { slug: string; name: string; count: number };

export type CatalogRow = {
  id: string;
  number: number;
  slug: string;
  title: string;
  difficulty: CatalogDifficulty;
  tags: { slug: string; name: string }[];
  /** Accepted / counted submits; null without counted submits ("—"). */
  acceptance: number | null;
  /** Null for guests. */
  status: CatalogStatus | null;
};

export type CatalogProgress = {
  solved: Record<CatalogDifficulty, number>;
  /** Submitted to but never accepted. */
  attempted: number;
  /** `attempted` by difficulty (the progress card's squares). */
  attemptedBy: Record<CatalogDifficulty, number>;
};

export type CatalogPage = {
  rows: CatalogRow[];
  /** Problems matching the filters (all pages). */
  total: number;
  page: number;
  pageSize: number;
  /** All published problems, overall and by difficulty. */
  published: { total: number; byDifficulty: Record<CatalogDifficulty, number> };
  /** Tags used by published problems, by name, with problem counts. */
  tags: CatalogTag[];
  /** Null for guests. */
  progress: CatalogProgress | null;
};

/**
 * `"problems"."id"` of the enclosing query, for correlated subqueries. Drizzle
 * leaves columns unqualified in single-table selects, and an unqualified
 * `"id"` inside a subquery would bind to the subquery's own table.
 */
export const PROBLEM_ID = sql.raw(`"problems"."id"`);

/** WHERE conditions on `problems` for the filters (published only). */
function filterConditions(filters: CatalogFilters, userId: string | null): SQL {
  const conds: (SQL | undefined)[] = [eq(problems.published, true)];
  if (filters.q) conds.push(ilike(problems.title, `%${escapeLike(filters.q)}%`));
  if (filters.difficulty) conds.push(eq(problems.difficulty, filters.difficulty));
  if (filters.tag) {
    conds.push(
      exists(
        sql`(select 1 from ${problemTags} pt inner join ${tags} t on t.id = pt.tag_id
            where pt.problem_id = ${PROBLEM_ID} and t.slug = ${filters.tag})`,
      ),
    );
  }
  if (filters.status && userId) {
    const anySubmit = sql`(select 1 from ${submissions} s
      where s.problem_id = ${PROBLEM_ID} and s.user_id = ${userId} and s.kind = 'submit')`;
    const accepted = sql`(select 1 from ${submissions} s
      where s.problem_id = ${PROBLEM_ID} and s.user_id = ${userId} and s.kind = 'submit'
        and s.status = 'accepted')`;
    if (filters.status === "solved") conds.push(exists(accepted));
    if (filters.status === "attempted") conds.push(exists(anySubmit), not(exists(accepted)));
    if (filters.status === "todo") conds.push(not(exists(anySubmit)));
  }
  return and(...conds)!;
}

type RawTagList = { slug: string; name: string; count: number }[] | null;

/** Query 1: published totals, tags, filtered count and one page of rows. */
async function queryCatalog(
  db: Db,
  filters: CatalogFilters,
  userId: string | null,
  pageSize: number,
) {
  const where = filterConditions(filters, userId);

  // One row of totals over all published problems; `filtered` counts the
  // matches with a FILTER clause on the same scan.
  const meta = db
    .select({
      publishedTotal: sql<number>`count(*)::int`.as("published_total"),
      easy: sql<number>`(count(*) filter (where ${problems.difficulty} = 'easy'))::int`.as("easy"),
      medium: sql<number>`(count(*) filter (where ${problems.difficulty} = 'medium'))::int`.as(
        "medium",
      ),
      hard: sql<number>`(count(*) filter (where ${problems.difficulty} = 'hard'))::int`.as("hard"),
      filtered: sql<number>`(count(*) filter (where ${where}))::int`.as("filtered"),
      tagList: sql<RawTagList>`(
        select json_agg(json_build_object('slug', x.slug, 'name', x.name, 'count', x.n) order by x.name)
        from (
          select t.slug, t.name, count(*)::int as n
          from ${tags} t
          inner join ${problemTags} pt on pt.tag_id = t.id
          inner join ${problems} p on p.id = pt.problem_id and p.published
          group by t.slug, t.name
        ) x
      )`.as("tag_list"),
    })
    .from(problems)
    .where(eq(problems.published, true))
    .as("meta");

  const page = db
    .select({
      id: problems.id,
      number: problems.number,
      slug: problems.slug,
      title: problems.title,
      difficulty: problems.difficulty,
      rowTags: sql<{ slug: string; name: string }[] | null>`(
        select json_agg(json_build_object('slug', t.slug, 'name', t.name) order by t.name)
        from ${problemTags} pt inner join ${tags} t on t.id = pt.tag_id
        where pt.problem_id = ${PROBLEM_ID}
      )`.as("row_tags"),
    })
    .from(problems)
    .where(where)
    .orderBy(asc(problems.number))
    .limit(pageSize)
    .offset((filters.page - 1) * pageSize)
    .as("page");

  // LEFT JOIN ON true: the meta row survives an empty page (no matches or
  // a page past the end), so totals and tags are always known.
  return db
    .select({
      publishedTotal: meta.publishedTotal,
      easy: meta.easy,
      medium: meta.medium,
      hard: meta.hard,
      filtered: meta.filtered,
      tagList: meta.tagList,
      id: page.id,
      number: page.number,
      slug: page.slug,
      title: page.title,
      difficulty: page.difficulty,
      rowTags: page.rowTags,
    })
    .from(meta)
    .leftJoin(page, sql`true`)
    .orderBy(asc(page.number));
}

/** Query 2: the user's per-problem submit status over published problems. */
function queryUserStatuses(db: Db, userId: string) {
  return db
    .select({
      problemId: submissions.problemId,
      difficulty: problems.difficulty,
      solved: sql<boolean>`bool_or(${submissions.status} = 'accepted')`,
    })
    .from(submissions)
    .innerJoin(problems, eq(problems.id, submissions.problemId))
    .where(
      and(
        eq(submissions.userId, userId),
        eq(submissions.kind, "submit"),
        eq(problems.published, true),
      ),
    )
    .groupBy(submissions.problemId, problems.difficulty);
}

/** Query 3: accepted / counted submits per problem for the page rows. */
function queryAcceptance(db: Db, problemIds: string[]) {
  return db
    .select({
      problemId: submissions.problemId,
      total: sql<number>`count(*)::int`,
      accepted: sql<number>`(count(*) filter (where ${submissions.status} = 'accepted'))::int`,
    })
    .from(submissions)
    .where(
      and(
        inArray(submissions.problemId, problemIds),
        eq(submissions.kind, "submit"),
        notInArray(submissions.status, [...NOT_COUNTED_STATUSES]),
      ),
    )
    .groupBy(submissions.problemId);
}

/**
 * One catalog page for `filters`. Pass `userId: null` for guests: the status
 * filter is then ignored and rows carry `status: null`.
 */
export async function getCatalogPage({
  filters,
  userId,
  pageSize,
  db = getDb(),
}: {
  filters: CatalogFilters;
  userId: string | null;
  pageSize: number;
  db?: Db;
}): Promise<CatalogPage> {
  const [catalogRows, statusRows] = await Promise.all([
    queryCatalog(db, filters, userId, pageSize),
    userId ? queryUserStatuses(db, userId) : Promise.resolve(null),
  ]);

  const head = catalogRows[0];
  const pageRows = catalogRows.filter(
    (r): r is typeof r & { id: string; number: number; slug: string; title: string; difficulty: CatalogDifficulty } =>
      r.id !== null,
  );
  const acceptanceRows = pageRows.length
    ? await queryAcceptance(
        db,
        pageRows.map((r) => r.id),
      )
    : [];

  const acceptance = new Map(acceptanceRows.map((a) => [a.problemId, a]));
  const statuses = new Map(statusRows?.map((s) => [s.problemId, s.solved]) ?? []);

  const rows: CatalogRow[] = pageRows.map((r) => {
    const acc = acceptance.get(r.id);
    const solved = statuses.get(r.id);
    return {
      id: r.id,
      number: r.number,
      slug: r.slug,
      title: r.title,
      difficulty: r.difficulty,
      tags: r.rowTags ?? [],
      acceptance: acc && acc.total > 0 ? acc.accepted / acc.total : null,
      status: userId === null ? null : solved === undefined ? "todo" : solved ? "solved" : "attempted",
    };
  });

  let progress: CatalogProgress | null = null;
  if (statusRows) {
    const solved: Record<CatalogDifficulty, number> = { easy: 0, medium: 0, hard: 0 };
    const attemptedBy: Record<CatalogDifficulty, number> = { easy: 0, medium: 0, hard: 0 };
    for (const s of statusRows) {
      if (s.solved) solved[s.difficulty] += 1;
      else attemptedBy[s.difficulty] += 1;
    }
    progress = { solved, attempted: attemptedBy.easy + attemptedBy.medium + attemptedBy.hard, attemptedBy };
  }

  return {
    rows,
    total: head?.filtered ?? 0,
    page: filters.page,
    pageSize,
    published: {
      total: head?.publishedTotal ?? 0,
      byDifficulty: { easy: head?.easy ?? 0, medium: head?.medium ?? 0, hard: head?.hard ?? 0 },
    },
    tags: head?.tagList ?? [],
    progress,
  };
}
