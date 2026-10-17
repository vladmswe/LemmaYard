// Catalog filters in the URL (AC-M3-1, AC-M3-2): `q`, `difficulty`, `tag`,
// `status`, `page`. Parsing never throws: unknown or malformed values are
// dropped (the page renders unfiltered instead of answering 400). Shared by
// the server page (parse) and the client filter bar (build URLs).
import { z } from "zod";

export const DIFFICULTY_VALUES = ["easy", "medium", "hard"] as const;
export const STATUS_VALUES = ["solved", "attempted", "todo"] as const;

export type CatalogDifficulty = (typeof DIFFICULTY_VALUES)[number];
export type CatalogStatus = (typeof STATUS_VALUES)[number];

export type CatalogFilters = {
  q?: string;
  difficulty?: CatalogDifficulty;
  tag?: string;
  status?: CatalogStatus;
  /** 1-based; always >= 1. */
  page: number;
};

export const MAX_QUERY_LENGTH = 100;

const qSchema = z
  .string()
  .transform((s) => s.replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH))
  .pipe(z.string().min(1));
const difficultySchema = z.enum(DIFFICULTY_VALUES);
const statusSchema = z.enum(STATUS_VALUES);
// Tag slugs as written by the importer (lowercase, digits, dashes).
const tagSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64);
const pageSchema = z
  .string()
  .regex(/^\d{1,6}$/)
  .transform(Number)
  .pipe(z.number().int().min(1));

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** First value of a possibly repeated search param. */
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pick<T>(schema: z.ZodType<T>, value: string | undefined): T | undefined {
  if (value === undefined) return undefined;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** Parses Next.js `searchParams` (or URLSearchParams) into catalog filters. */
export function parseCatalogFilters(
  params: RawSearchParams | URLSearchParams,
): CatalogFilters {
  const get = (key: string) =>
    params instanceof URLSearchParams
      ? (params.get(key) ?? undefined)
      : first(params[key]);
  const filters: CatalogFilters = { page: pick(pageSchema, get("page")) ?? 1 };
  const q = pick(qSchema, get("q"));
  const difficulty = pick(difficultySchema, get("difficulty"));
  const tag = pick(tagSchema, get("tag"));
  const status = pick(statusSchema, get("status"));
  if (q) filters.q = q;
  if (difficulty) filters.difficulty = difficulty;
  if (tag) filters.tag = tag;
  if (status) filters.status = status;
  return filters;
}

/** Guests have no status: the filter is dropped silently (AC-M3-2). */
export function effectiveFilters(filters: CatalogFilters, signedIn: boolean): CatalogFilters {
  if (signedIn || !filters.status) return filters;
  const rest = { ...filters };
  delete rest.status;
  return rest;
}

/** True when any narrowing filter (not the page) is set. */
export function hasActiveFilters(filters: CatalogFilters): boolean {
  return Boolean(filters.q || filters.difficulty || filters.tag || filters.status);
}

export const CATALOG_PATH = "/problems";

/**
 * `/problems?…` for `filters` with `patch` applied. Changing any filter resets
 * the page to 1 unless the patch sets `page`; `undefined` in the patch removes
 * that filter. Defaults (page 1, empty filters) are left out of the URL.
 */
export function catalogHref(
  filters: CatalogFilters,
  patch: Partial<Record<keyof CatalogFilters, string | number | undefined>> = {},
): string {
  const merged: Record<string, string | number | undefined> = { ...filters };
  const changesFilter = Object.keys(patch).some((k) => k !== "page");
  if (changesFilter) merged.page = undefined;
  Object.assign(merged, patch);

  const search = new URLSearchParams();
  for (const key of ["q", "difficulty", "tag", "status"] as const) {
    const value = merged[key];
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const page = Number(merged.page);
  if (Number.isInteger(page) && page > 1) search.set("page", String(page));
  const qs = search.toString();
  return qs ? `${CATALOG_PATH}?${qs}` : CATALOG_PATH;
}

/** Escapes `%`, `_` and `\` for a Postgres (I)LIKE pattern with the default escape. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
