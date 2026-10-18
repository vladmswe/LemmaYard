import type { CatalogDifficulty } from "@/lib/catalog/filters";
import type { Language, SubmissionKind, SubmissionStatus } from "@/lib/submission-dto";

/** Fill percentage for a progress bar, clamped to 0..100; 0 when max <= 0. */
export function progressPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

/**
 * Submit statuses left out of acceptance and the submission count: internal
 * errors (the judge's fault) and jobs still waiting for a verdict (PLAN §4).
 */
export const NOT_COUNTED_STATUSES = ["internal_error", "queued", "running"] as const satisfies readonly SubmissionStatus[];

export function isCountedStatus(status: SubmissionStatus): boolean {
  return !(NOT_COUNTED_STATUSES as readonly SubmissionStatus[]).includes(status);
}

/**
 * One group of a user's submissions: all rows for one problem with the same
 * kind and status (what `getUserStats` reads from the database).
 */
export type SubmissionGroup = {
  problemId: string;
  slug: string;
  title: string;
  difficulty: CatalogDifficulty;
  published: boolean;
  kind: SubmissionKind;
  status: SubmissionStatus;
  count: number;
  /** Earliest `created_at` in the group. */
  firstAt: Date;
  /** Set when the rows are also grouped by language (profile). */
  language?: Language;
};

export type SolvedProblem = {
  slug: string;
  title: string;
  difficulty: CatalogDifficulty;
  /** Time of the first accepted submit. */
  firstAcceptedAt: Date;
};

export type UserStats = {
  /** Unique published problems with at least one accepted submit, by difficulty. */
  solved: Record<CatalogDifficulty, number>;
  solvedTotal: number;
  /** Counted submits (internal_error / queued / running excluded) on published problems. */
  submits: number;
  /** Accepted / counted submits; null without counted submits ("—"). */
  acceptance: number | null;
  /** Most recently solved unique problems, newest first (by first accepted). */
  recentSolved: SolvedProblem[];
};

export const RECENT_SOLVED_LIMIT = 10;

/**
 * Profile / landing statistics from a user's submission groups (AC-M6-4,
 * AC-M6-5). Rules: only `submit` rows count (runs never do); only published
 * problems count; a problem is solved once, however many accepted submits it
 * has; acceptance and the submission count leave out internal errors and
 * pending jobs.
 */
export function summarizeUserStats(
  groups: readonly SubmissionGroup[],
  recentLimit = RECENT_SOLVED_LIMIT,
): UserStats {
  const solved: Record<CatalogDifficulty, number> = { easy: 0, medium: 0, hard: 0 };
  const firstAccepted = new Map<string, SolvedProblem>();
  let submits = 0;
  let accepted = 0;

  for (const g of groups) {
    if (g.kind !== "submit" || !g.published || g.count <= 0) continue;
    if (isCountedStatus(g.status)) submits += g.count;
    if (g.status !== "accepted") continue;
    accepted += g.count;
    const prev = firstAccepted.get(g.problemId);
    if (!prev) {
      solved[g.difficulty] += 1;
      firstAccepted.set(g.problemId, {
        slug: g.slug,
        title: g.title,
        difficulty: g.difficulty,
        firstAcceptedAt: g.firstAt,
      });
    } else if (g.firstAt < prev.firstAcceptedAt) {
      prev.firstAcceptedAt = g.firstAt;
    }
  }

  const recentSolved = [...firstAccepted.values()]
    .sort((a, b) => b.firstAcceptedAt.getTime() - a.firstAcceptedAt.getTime() || a.slug.localeCompare(b.slug))
    .slice(0, Math.max(0, recentLimit));

  return {
    solved,
    solvedTotal: solved.easy + solved.medium + solved.hard,
    submits,
    acceptance: submits > 0 ? accepted / submits : null,
    recentSolved,
  };
}

export type ProfileExtras = {
  /** Unique published problems with counted submits but no accepted one, by difficulty. */
  attempted: Record<CatalogDifficulty, number>;
  /** Language of each solved problem's first accepted submit (by slug). */
  solvedLanguage: Record<string, Language>;
  /** The language with the most counted submits; null without any (ties: the first in order). */
  mainLanguage: Language | null;
};

/**
 * Profile-only details from the same groups (grouped by language too): the
 * proof sheet's "attempted" squares, the language of each first accepted
 * submit and the main language. Same counting rules as `summarizeUserStats`.
 */
export function summarizeProfileExtras(groups: readonly SubmissionGroup[]): ProfileExtras {
  const attempted: Record<CatalogDifficulty, number> = { easy: 0, medium: 0, hard: 0 };
  const solved = new Map<string, { at: Date; language?: Language; slug: string }>();
  const tried = new Map<string, CatalogDifficulty>();
  const perLanguage = new Map<Language, number>();

  for (const g of groups) {
    if (g.kind !== "submit" || !g.published || g.count <= 0) continue;
    if (isCountedStatus(g.status)) {
      tried.set(g.problemId, g.difficulty);
      if (g.language) perLanguage.set(g.language, (perLanguage.get(g.language) ?? 0) + g.count);
    }
    if (g.status !== "accepted") continue;
    const prev = solved.get(g.problemId);
    if (!prev || g.firstAt < prev.at) solved.set(g.problemId, { at: g.firstAt, language: g.language, slug: g.slug });
  }
  for (const [problemId, difficulty] of tried) if (!solved.has(problemId)) attempted[difficulty] += 1;

  const solvedLanguage: Record<string, Language> = {};
  for (const { slug, language } of solved.values()) if (language) solvedLanguage[slug] = language;

  let mainLanguage: Language | null = null;
  for (const [language, n] of perLanguage) if (mainLanguage === null || n > perLanguage.get(mainLanguage)!) mainLanguage = language;

  return { attempted, solvedLanguage, mainLanguage };
}
