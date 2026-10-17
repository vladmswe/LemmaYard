// Submission history URL state (AC-M6-1): `?page=` and `?problem=<slug>`.
// Parsing never throws: a malformed page means page 1, a malformed slug is
// kept as "unknown problem" (the page shows an empty state, not an error).
import { z } from "zod";

import type { RawSearchParams } from "@/lib/catalog/filters";

export const SUBMISSIONS_PATH = "/submissions";

/** Latest submits shown in the problem page's Submissions tab. */
export const PROBLEM_TAB_LIMIT = 20;

export type HistoryParams = {
  /** 1-based; always >= 1. */
  page: number;
  /** Problem slug filter as given (validated against the DB later). */
  problem?: string;
};

const pageSchema = z
  .string()
  .regex(/^\d{1,6}$/)
  .transform(Number)
  .pipe(z.number().int().min(1));

/** Problem slugs as the importer writes them. */
export const PROBLEM_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 100;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseHistoryParams(params: RawSearchParams): HistoryParams {
  const rawPage = first(params.page);
  const parsedPage = rawPage === undefined ? undefined : pageSchema.safeParse(rawPage);
  const out: HistoryParams = { page: parsedPage?.success ? parsedPage.data : 1 };
  const problem = first(params.problem)?.trim();
  if (problem) out.problem = problem.slice(0, MAX_SLUG_LENGTH + 1);
  return out;
}

/** True when `slug` could be a problem slug at all (else: no DB lookup, "unknown"). */
export function isValidSlug(slug: string): boolean {
  return slug.length <= MAX_SLUG_LENGTH && PROBLEM_SLUG_PATTERN.test(slug);
}

/** `/submissions?…`; page 1 and an empty filter are left out of the URL. */
export function submissionsHref({ page = 1, problem }: { page?: number; problem?: string } = {}): string {
  const search = new URLSearchParams();
  if (problem) search.set("problem", problem);
  if (Number.isInteger(page) && page > 1) search.set("page", String(page));
  const qs = search.toString();
  return qs ? `${SUBMISSIONS_PATH}?${qs}` : SUBMISSIONS_PATH;
}

/** First 8 hex digits of a submission id: "Submissions › Two Sum · a1b2c3d4". */
export function shortId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}
