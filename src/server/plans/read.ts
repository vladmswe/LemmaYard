// Study plan reads for the pages and the GET routes (docs/specs/community.md
// §B.8, §C.6). The plan page costs at most 4 queries for 300 items
// (AC-C-SP-7): the plan with its access data, then sections, items (with the
// viewer's ticks) and the viewer's submit summary in parallel. Progress is the
// VIEWER's (AC-C-SP-3): another user's submits or ticks are never read here.
import { and, asc, desc, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { leetCodeProblemUrl, titleFromSlug } from "@/lib/plans/leetcode";
import {
  problemState,
  summarizeProgress,
  type Difficulty,
  type ItemState,
  type PlanProgress,
  type SubmitSummary,
} from "@/lib/plans/progress";
import type { PlanSort, PlanSource, PlanVisibility } from "@/lib/plans/schemas";
import {
  problems,
  studyPlanItems,
  studyPlans,
  studyPlanSaves,
  studyPlanSections,
  studyPlanTicks,
  submissions,
  users,
} from "@/server/db/schema";

import { isPlanId, readRole } from "./access";
import type { Executor } from "./types";

export const DISCOVER_PAGE_SIZE = 20;
const PICKER_LIMIT = 50;

export type PlanItemView = {
  id: string;
  note: string | null;
  sectionId: string | null;
  state: ItemState;
} & (
  | { kind: "problem"; problem: { slug: string; title: string; number: number; difficulty: Difficulty; published: boolean } }
  | { kind: "external"; external: { slug: string; title: string; url: string; customTitle: string | null } }
);

export type PlanSectionView = { id: string; title: string; items: PlanItemView[] };

export type PlanPageData = {
  plan: {
    id: string;
    title: string;
    description: string | null;
    visibility: PlanVisibility;
    source: PlanSource;
    itemCount: number;
    saveCount: number;
    updatedAt: string;
    ownerUsername: string;
    /** Credit for a duplicate: only while the source plan is public. */
    forkedFrom: { id: string; title: string; ownerUsername: string } | null;
  };
  viewer: {
    signedIn: boolean;
    isOwner: boolean;
    saved: boolean;
    /** The share token the viewer opened the plan with (unlisted readers), for tick/save/duplicate calls. */
    share: string | null;
  };
  /** Owner only: the link token (null until the plan was first shared by link). */
  shareToken: string | null;
  unsectioned: PlanItemView[];
  sections: PlanSectionView[];
  /** The viewer's progress; null for guests. */
  progress: PlanProgress | null;
};

const forked = alias(studyPlans, "forked");
const forkedOwner = alias(users, "forked_owner");

/** The plan page (≤ 4 queries), or null when the viewer may not read it (→ 404). */
export async function getPlanPage(
  db: Executor,
  planId: string,
  viewerId: string | null,
  share: string | null | undefined,
): Promise<PlanPageData | null> {
  if (!isPlanId(planId)) return null;
  // Query 1: the plan, its owner, the credited source and the viewer's save.
  const [row] = await db
    .select({
      id: studyPlans.id,
      ownerId: studyPlans.ownerId,
      title: studyPlans.title,
      description: studyPlans.description,
      visibility: studyPlans.visibility,
      shareToken: studyPlans.shareToken,
      source: studyPlans.source,
      itemCount: studyPlans.itemCount,
      saveCount: studyPlans.saveCount,
      updatedAt: studyPlans.updatedAt,
      ownerUsername: users.username,
      forkedId: forked.id,
      forkedTitle: forked.title,
      forkedVisibility: forked.visibility,
      forkedOwnerUsername: forkedOwner.username,
      saved: sql<boolean>`${viewerId === null ? sql`false` : sql`EXISTS (SELECT 1 FROM ${studyPlanSaves} WHERE ${studyPlanSaves.planId} = ${studyPlans.id} AND ${studyPlanSaves.userId} = ${viewerId})`}`,
    })
    .from(studyPlans)
    .innerJoin(users, eq(users.id, studyPlans.ownerId))
    .leftJoin(forked, eq(forked.id, studyPlans.forkedFromId))
    .leftJoin(forkedOwner, eq(forkedOwner.id, forked.ownerId))
    .where(eq(studyPlans.id, planId))
    .limit(1);
  if (!row) return null;
  const access = readRole(row, viewerId, share);
  if (!access) return null;

  const [sectionRows, itemRows, summaries] = await Promise.all([
    // Query 2: sections in order.
    db
      .select({ id: studyPlanSections.id, title: studyPlanSections.title })
      .from(studyPlanSections)
      .where(eq(studyPlanSections.planId, planId))
      .orderBy(asc(studyPlanSections.position), asc(studyPlanSections.createdAt), asc(studyPlanSections.id)),
    // Query 3: items with their problem and the viewer's tick.
    db
      .select({
        id: studyPlanItems.id,
        sectionId: studyPlanItems.sectionId,
        note: studyPlanItems.note,
        problemId: studyPlanItems.problemId,
        externalSlug: studyPlanItems.externalSlug,
        externalTitle: studyPlanItems.externalTitle,
        slug: problems.slug,
        title: problems.title,
        number: problems.number,
        difficulty: problems.difficulty,
        published: problems.published,
        ticked: viewerId === null ? sql<boolean>`false` : sql<boolean>`${studyPlanTicks.itemId} IS NOT NULL`,
      })
      .from(studyPlanItems)
      .leftJoin(problems, eq(problems.id, studyPlanItems.problemId))
      .leftJoin(
        studyPlanTicks,
        viewerId === null
          ? sql`false`
          : and(eq(studyPlanTicks.itemId, studyPlanItems.id), eq(studyPlanTicks.userId, viewerId)),
      )
      .where(eq(studyPlanItems.planId, planId))
      .orderBy(asc(studyPlanItems.position), asc(studyPlanItems.createdAt), asc(studyPlanItems.id)),
    // Query 4: the viewer's submits on the plan's problems (signed in only).
    viewerId === null ? Promise.resolve([]) : viewerSubmitSummaries(db, viewerId, planId),
  ]);

  const byProblem = new Map(summaries.map((s) => [s.problemId, s]));
  const items: PlanItemView[] = itemRows.map((r) => {
    const base = { id: r.id, note: r.note, sectionId: r.sectionId };
    if (r.externalSlug !== null) {
      return {
        ...base,
        kind: "external" as const,
        external: {
          slug: r.externalSlug,
          title: r.externalTitle ?? titleFromSlug(r.externalSlug),
          customTitle: r.externalTitle,
          url: leetCodeProblemUrl(r.externalSlug),
        },
        state: { kind: "external" as const, done: r.ticked },
      };
    }
    const published = r.published === true;
    return {
      ...base,
      kind: "problem" as const,
      problem: {
        slug: r.slug!,
        title: r.title!,
        number: r.number!,
        difficulty: r.difficulty!,
        published,
      },
      state: problemState(byProblem.get(r.problemId!), published),
    };
  });

  const sectionIds = new Set(sectionRows.map((s) => s.id));
  const sections: PlanSectionView[] = sectionRows.map((s) => ({ ...s, items: [] }));
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const unsectioned: PlanItemView[] = [];
  for (const item of items) {
    if (item.sectionId !== null && sectionIds.has(item.sectionId)) sectionById.get(item.sectionId)!.items.push(item);
    else unsectioned.push(item);
  }
  const ordered = [...unsectioned, ...sections.flatMap((s) => s.items)];
  const isOwner = access.role === "owner";

  return {
    plan: {
      id: row.id,
      title: row.title,
      description: row.description,
      visibility: row.visibility,
      source: row.source,
      itemCount: row.itemCount,
      saveCount: row.saveCount,
      updatedAt: row.updatedAt.toISOString(),
      ownerUsername: row.ownerUsername,
      forkedFrom:
        row.forkedId && row.forkedVisibility === "public"
          ? { id: row.forkedId, title: row.forkedTitle!, ownerUsername: row.forkedOwnerUsername! }
          : null,
    },
    viewer: { signedIn: viewerId !== null, isOwner, saved: row.saved, share: access.viaToken },
    shareToken: isOwner ? row.shareToken : null,
    unsectioned,
    sections,
    progress:
      viewerId === null
        ? null
        : summarizeProgress(
            ordered.map((i) => ({
              id: i.id,
              difficulty: i.kind === "problem" ? i.problem.difficulty : null,
              state: i.state,
            })),
          ),
  };
}

/** The viewer's submit summary per problem of one plan (catalog rule: any submit = attempted). */
async function viewerSubmitSummaries(
  db: Executor,
  viewerId: string,
  planId: string,
): Promise<(SubmitSummary & { problemId: string })[]> {
  const rows = await db
    .select({
      problemId: submissions.problemId,
      solved: sql<boolean>`bool_or(${submissions.status} = 'accepted')`,
      firstSolvedAt: sql<Date | null>`min(${submissions.createdAt}) FILTER (WHERE ${submissions.status} = 'accepted')`,
      wrongCount: sql<number>`(count(*) FILTER (WHERE ${submissions.status} IN ('wrong_answer', 'time_limit', 'memory_limit', 'runtime_error', 'compile_error')))::int`,
    })
    .from(submissions)
    .where(
      and(
        eq(submissions.userId, viewerId),
        eq(submissions.kind, "submit"),
        inArray(
          submissions.problemId,
          db
            .select({ id: studyPlanItems.problemId })
            .from(studyPlanItems)
            .where(and(eq(studyPlanItems.planId, planId), isNotNull(studyPlanItems.problemId))),
        ),
      ),
    )
    .groupBy(submissions.problemId);
  return rows.map((r) => ({ ...r, firstSolvedAt: r.firstSolvedAt ? new Date(r.firstSolvedAt) : null }));
}

// --- Lists ------------------------------------------------------------------

export type PlanCard = {
  id: string;
  title: string;
  visibility: PlanVisibility;
  ownerUsername: string;
  itemCount: number;
  sectionCount: number;
  saveCount: number;
  updatedAt: string;
  /** The viewer's progress over the available items (null when not computed, e.g. for guests). */
  done: number | null;
  total: number | null;
  /** Saved unlisted plans: the link token to open them with. */
  share: string | null;
};

// Drizzle leaves columns unqualified in a select without joins, which would be
// ambiguous inside these correlated subqueries: name the outer plan explicitly.
const PLAN_ID = sql.raw(`"study_plans"."id"`);

const sectionCountSql = sql<number>`(SELECT count(*)::int FROM study_plan_sections s WHERE s.plan_id = ${PLAN_ID})`;

/** Items that count (external ones and published problems) and those the viewer has done. */
function progressColumns(viewerId: string) {
  return {
    total: sql<number>`(SELECT count(*)::int FROM study_plan_items i LEFT JOIN problems pr ON pr.id = i.problem_id
      WHERE i.plan_id = ${PLAN_ID} AND (i.external_slug IS NOT NULL OR pr.published))`,
    done: sql<number>`(SELECT count(*)::int FROM study_plan_items i LEFT JOIN problems pr ON pr.id = i.problem_id
      WHERE i.plan_id = ${PLAN_ID} AND (
        (pr.published AND EXISTS (SELECT 1 FROM submissions s WHERE s.user_id = ${viewerId} AND s.problem_id = i.problem_id
          AND s.kind = 'submit' AND s.status = 'accepted'))
        OR (i.external_slug IS NOT NULL AND EXISTS (SELECT 1 FROM study_plan_ticks t WHERE t.user_id = ${viewerId} AND t.item_id = i.id))))`,
  };
}

function card(r: {
  id: string;
  title: string;
  visibility: PlanVisibility;
  ownerUsername: string;
  itemCount: number;
  sectionCount: number;
  saveCount: number;
  updatedAt: Date;
  done?: number;
  total?: number;
  share?: string | null;
}): PlanCard {
  return {
    id: r.id,
    title: r.title,
    visibility: r.visibility,
    ownerUsername: r.ownerUsername,
    itemCount: r.itemCount,
    sectionCount: r.sectionCount,
    saveCount: r.saveCount,
    updatedAt: r.updatedAt.toISOString(),
    done: r.done ?? null,
    total: r.total ?? null,
    share: r.share ?? null,
  };
}

/** The viewer's own plans (newest change first) and the plans they saved that they can still open (2 queries). */
export async function listMyPlans(db: Executor, userId: string): Promise<{ mine: PlanCard[]; saved: PlanCard[] }> {
  const base = {
    id: studyPlans.id,
    title: studyPlans.title,
    visibility: studyPlans.visibility,
    ownerUsername: users.username,
    itemCount: studyPlans.itemCount,
    sectionCount: sectionCountSql,
    saveCount: studyPlans.saveCount,
    updatedAt: studyPlans.updatedAt,
    ...progressColumns(userId),
  };
  const [mine, saved] = await Promise.all([
    db
      .select(base)
      .from(studyPlans)
      .innerJoin(users, eq(users.id, studyPlans.ownerId))
      .where(eq(studyPlans.ownerId, userId))
      .orderBy(desc(studyPlans.updatedAt), asc(studyPlans.id)),
    // AC-C-SP-5: a saved plan that went private (or whose link was reset) disappears.
    db
      .select({ ...base, share: studyPlanSaves.shareToken })
      .from(studyPlanSaves)
      .innerJoin(studyPlans, eq(studyPlans.id, studyPlanSaves.planId))
      .innerJoin(users, eq(users.id, studyPlans.ownerId))
      .where(
        and(
          eq(studyPlanSaves.userId, userId),
          or(
            eq(studyPlans.visibility, "public"),
            and(eq(studyPlans.visibility, "unlisted"), eq(studyPlans.shareToken, studyPlanSaves.shareToken)),
          ),
        ),
      )
      .orderBy(desc(studyPlanSaves.createdAt), asc(studyPlans.id)),
  ]);
  return {
    mine: mine.map(card),
    saved: saved.map((r) => card({ ...r, share: r.visibility === "unlisted" ? r.share : null })),
  };
}

/** `%`, `_` and `\` are literal in a user's search text. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Public plans, Popular (saves) or New, optionally filtered by title (1 query). */
export async function listPublicPlans(
  db: Executor,
  options: { q: string; sort: PlanSort; page: number },
): Promise<{ plans: PlanCard[]; total: number; page: number; pageSize: number }> {
  const where = and(
    eq(studyPlans.visibility, "public"),
    options.q ? ilike(studyPlans.title, likePattern(options.q)) : undefined,
  );
  const rows = await db
    .select({
      id: studyPlans.id,
      title: studyPlans.title,
      visibility: studyPlans.visibility,
      ownerUsername: users.username,
      itemCount: studyPlans.itemCount,
      sectionCount: sectionCountSql,
      saveCount: studyPlans.saveCount,
      updatedAt: studyPlans.updatedAt,
      fullCount: sql<number>`(count(*) OVER ())::int`,
    })
    .from(studyPlans)
    .innerJoin(users, eq(users.id, studyPlans.ownerId))
    .where(where)
    .orderBy(
      ...(options.sort === "new"
        ? [desc(studyPlans.updatedAt), asc(studyPlans.id)]
        : [desc(studyPlans.saveCount), desc(studyPlans.updatedAt), asc(studyPlans.id)]),
    )
    .limit(DISCOVER_PAGE_SIZE)
    .offset((options.page - 1) * DISCOVER_PAGE_SIZE);
  return {
    plans: rows.map(card),
    total: rows[0]?.fullCount ?? 0,
    page: options.page,
    pageSize: DISCOVER_PAGE_SIZE,
  };
}

export type PickerPlan = {
  id: string;
  title: string;
  visibility: PlanVisibility;
  itemCount: number;
  sectionTitles: string[];
  /** Whether the plan already holds the problem asked about. */
  hasProblem: boolean;
};

/** The add-to-plan dialog: the viewer's plans with their sections, marked when they hold `problemSlug` (1 query). */
export async function listPickerPlans(db: Executor, userId: string, problemSlug: string | null): Promise<PickerPlan[]> {
  const rows = await db
    .select({
      id: studyPlans.id,
      title: studyPlans.title,
      visibility: studyPlans.visibility,
      itemCount: studyPlans.itemCount,
      sectionTitles: sql<string[]>`coalesce((SELECT json_agg(s.title ORDER BY s.position, s.created_at, s.id)
        FROM study_plan_sections s WHERE s.plan_id = ${PLAN_ID}), '[]'::json)`,
      hasProblem:
        problemSlug === null
          ? sql<boolean>`false`
          : sql<boolean>`EXISTS (SELECT 1 FROM study_plan_items i JOIN problems pr ON pr.id = i.problem_id
              WHERE i.plan_id = ${PLAN_ID} AND pr.slug = ${problemSlug})`,
    })
    .from(studyPlans)
    .where(eq(studyPlans.ownerId, userId))
    .orderBy(desc(studyPlans.updatedAt), asc(studyPlans.id))
    .limit(PICKER_LIMIT);
  return rows;
}

export type ProblemHit = { slug: string; number: number; title: string; difficulty: Difficulty };

/** Published problems by title or number, for the "Add problems" dialog (1 query, ≤ 10 rows). */
export async function searchPlanProblems(db: Executor, q: string): Promise<ProblemHit[]> {
  const text = q.trim();
  if (!text) return [];
  const asNumber = /^\d{1,6}$/.test(text) ? Number(text) : null;
  return db
    .select({ slug: problems.slug, number: problems.number, title: problems.title, difficulty: problems.difficulty })
    .from(problems)
    .where(
      and(
        eq(problems.published, true),
        or(
          ilike(problems.title, likePattern(text)),
          eq(problems.slug, text.toLowerCase()),
          asNumber === null ? undefined : eq(problems.number, asNumber),
        ),
      ),
    )
    .orderBy(asc(problems.number))
    .limit(10);
}
