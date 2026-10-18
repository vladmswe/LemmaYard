// The LeetCode metadata catalog (docs/specs/leetcode-integration.md §6.2,
// §6.3): Zod schemas of the generated `catalog.json` and the hand-edited
// `overlay.json`, and the pure merge of the two. Pure module (no server
// imports): the generator script, the server loader and the unit tests share it.
//
// The catalog holds FACTS ONLY: number, slug, title, contest position and the
// community contest rating from zerotrac/leetcode_problem_rating (MIT). Never
// statements, examples, hints, tests or premium content. Our own labels
// (difficulty overrides, topic tags, premium/exclude flags, extra problems)
// live in the overlay, so regenerating the catalog never overwrites them.
import { z } from "zod";

import { EXTERNAL_SLUG_MAX, EXTERNAL_SLUG_RE, EXTERNAL_TITLE_MAX, hasUnsafeText } from "@/lib/rooms/external";
import { DIFFICULTIES, type Difficulty } from "@/lib/rooms/types";

import { difficultyFromRating } from "./difficulty";

export const CATALOG_VERSION = 1;
export const OVERLAY_VERSION = 1;
export const CATALOG_N_MAX = 99_999;
export const CATALOG_RATING_MIN = 800;
export const CATALOG_RATING_MAX = 4000;
export const CATALOG_MAX_PROBLEMS = 20_000;
export const OVERLAY_MAX_PROBLEMS = 10_000;
export const OVERLAY_TAGS_MAX = 8;
export const OVERLAY_NOTE_MAX = 200;
export const CONTEST_RE = /^(?:weekly|biweekly)-contest-[0-9]{1,4}$/;
export const DATASET_NAME = "zerotrac/leetcode_problem_rating";
export const DATASET_URL = "https://github.com/zerotrac/leetcode_problem_rating";

/**
 * Our topic tag slugs that LeetCode topics map to (§6.3): the same slugs our
 * own problems use (`problems/<slug>/meta.json`), so a session's topics filter
 * both. A unit test keeps this list inside the tags of `problems/`.
 */
export const LEETCODE_TAG_SLUGS = [
  "array",
  "backtracking",
  "binary-search",
  "bit-manipulation",
  "breadth-first-search",
  "depth-first-search",
  "dynamic-programming",
  "graph",
  "greedy",
  "hash-table",
  "heap",
  "math",
  "matrix",
  "monotonic-stack",
  "prefix-sum",
  "shortest-path",
  "sliding-window",
  "sorting",
  "stack",
  "string",
  "topological-sort",
  "tree",
  "trie",
  "two-pointers",
  "union-find",
] as const;
export type LeetCodeTag = (typeof LEETCODE_TAG_SLUGS)[number];

/**
 * Who set an overlay value: "owner" = the site owner by hand (the default
 * when absent), "estimated" = an agent's or script's estimate the owner has not
 * confirmed. The UI labels "estimated" values as such.
 */
export const OVERLAY_SOURCES = ["owner", "estimated"] as const;
export type OverlaySource = (typeof OVERLAY_SOURCES)[number];

export const leetcodeSlugSchema = z
  .string()
  .min(1)
  .max(EXTERNAL_SLUG_MAX)
  .regex(EXTERNAL_SLUG_RE, "slug: lowercase letters, digits and single hyphens");

/** A title: 1–100 characters, no surrounding space, no control/bidi/invisible characters. */
export const catalogTitleSchema = z
  .string()
  .min(1)
  .refine((s) => [...s].length <= EXTERNAL_TITLE_MAX, `title: at most ${EXTERNAL_TITLE_MAX} characters`)
  .refine((s) => s.trim() === s, "title: no leading or trailing space")
  .refine((s) => !hasUnsafeText(s), "title: control or invisible characters");

const numberSchema = z.int().min(1).max(CATALOG_N_MAX);
const ratingSchema = z.int().min(CATALOG_RATING_MIN).max(CATALOG_RATING_MAX);

export const catalogEntrySchema = z.strictObject({
  /** LeetCode's frontend problem number. */
  n: numberSchema,
  slug: leetcodeSlugSchema,
  title: catalogTitleSchema,
  /** zerotrac's contest rating, rounded. */
  rating: ratingSchema,
  contest: z.string().regex(CONTEST_RE),
  /** Position in the contest (Q1–Q4; very rarely Q5). */
  q: z.int().min(1).max(5),
});
export type CatalogEntry = z.infer<typeof catalogEntrySchema>;

export const catalogSourceSchema = z.strictObject({
  name: z.literal(DATASET_NAME),
  url: z.literal(DATASET_URL),
  /** The dataset commit the catalog was generated from. */
  commit: z.string().regex(/^[0-9a-f]{40}$/),
  licence: z.literal("MIT"),
  retrievedAt: z.iso.date(),
});
export type CatalogSource = z.infer<typeof catalogSourceSchema>;

export const catalogFileSchema = z
  .strictObject({
    version: z.literal(CATALOG_VERSION),
    source: catalogSourceSchema,
    problems: z.array(catalogEntrySchema).max(CATALOG_MAX_PROBLEMS),
  })
  .superRefine((file, ctx) => {
    const slugs = new Set<string>();
    const numbers = new Set<number>();
    file.problems.forEach((p, i) => {
      if (slugs.has(p.slug)) ctx.addIssue({ code: "custom", path: ["problems", i, "slug"], message: `duplicate slug ${p.slug}` });
      if (numbers.has(p.n)) ctx.addIssue({ code: "custom", path: ["problems", i, "n"], message: `duplicate number ${p.n}` });
      if (i > 0 && file.problems[i - 1].n >= p.n) {
        ctx.addIssue({ code: "custom", path: ["problems", i, "n"], message: "problems must be sorted by number" });
      }
      slugs.add(p.slug);
      numbers.add(p.n);
    });
  });
export type CatalogFile = z.infer<typeof catalogFileSchema>;

export const overlayEntrySchema = z.strictObject({
  /** Extra problems only (slug not in the catalog): number and title are required. */
  n: numberSchema.optional(),
  title: catalogTitleSchema.optional(),
  /** Extra problems only. */
  rating: ratingSchema.optional(),
  ratingSource: z.enum(OVERLAY_SOURCES).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  difficultySource: z.enum(OVERLAY_SOURCES).optional(),
  tags: z
    .array(z.enum(LEETCODE_TAG_SLUGS))
    .max(OVERLAY_TAGS_MAX)
    .refine((t) => new Set(t).size === t.length, "each tag once")
    .optional(),
  tagsSource: z.enum(OVERLAY_SOURCES).optional(),
  /** Paid-only on LeetCode: never drawn or offered. */
  premium: z.boolean().optional(),
  /** Hidden from rooms for any other reason. */
  exclude: z.boolean().optional(),
  /** The owner's own remark; never rendered. */
  note: z
    .string()
    .max(OVERLAY_NOTE_MAX)
    .refine((s) => !/\p{Cc}/u.test(s), "note: control characters")
    .optional(),
});
export type OverlayEntry = z.infer<typeof overlayEntrySchema>;

export const overlayFileSchema = z.strictObject({
  version: z.literal(OVERLAY_VERSION),
  problems: z
    .record(leetcodeSlugSchema, overlayEntrySchema)
    .refine((r) => Object.keys(r).length <= OVERLAY_MAX_PROBLEMS, `at most ${OVERLAY_MAX_PROBLEMS} entries`),
});
export type OverlayFile = z.infer<typeof overlayFileSchema>;

// --- Merged view -------------------------------------------------------------

/** Where a problem's rating comes from: the dataset, the owner, or an unconfirmed estimate. */
export type RatingSource = "zerotrac" | OverlaySource;
/** Where its difficulty comes from: derived from the rating (an estimate), the owner, or another estimate. */
export type DifficultySource = "rating" | OverlaySource;

export type LeetCodeProblem = {
  n: number;
  slug: string;
  title: string;
  rating: number | null;
  ratingSource: RatingSource | null;
  difficulty: Difficulty | null;
  difficultySource: DifficultySource | null;
  tags: string[];
  tagsSource: OverlaySource | null;
  contest: string | null;
  q: number | null;
  premium: boolean;
  exclude: boolean;
};

export type MergeResult = { ok: true; problems: LeetCodeProblem[] } | { ok: false; issues: string[] };

/**
 * The catalog with the overlay applied, sorted by number. Overlay keys in the
 * catalog may change difficulty, tags and flags (not number, title or
 * rating); other keys add a problem and need a number and a title. Problems
 * without a rating get no difficulty unless the overlay gives one (they are
 * then never auto-picked by rating or difficulty, only picked by hand).
 */
export function mergeCatalog(catalog: CatalogFile, overlay: OverlayFile): MergeResult {
  const issues: string[] = [];
  const bySlug = new Map(catalog.problems.map((p) => [p.slug, p]));
  const numbers = new Set(catalog.problems.map((p) => p.n));
  const out: LeetCodeProblem[] = catalog.problems.map((p) => ({
    n: p.n,
    slug: p.slug,
    title: p.title,
    rating: p.rating,
    ratingSource: "zerotrac",
    difficulty: difficultyFromRating(p.rating),
    difficultySource: "rating",
    tags: [],
    tagsSource: null,
    contest: p.contest,
    q: p.q,
    premium: false,
    exclude: false,
  }));
  const index = new Map(out.map((p, i) => [p.slug, i]));

  for (const slug of Object.keys(overlay.problems).sort()) {
    const o = overlay.problems[slug];
    if (o.ratingSource !== undefined && o.rating === undefined) issues.push(`${slug}: ratingSource without rating`);
    if (o.difficultySource !== undefined && o.difficulty === undefined) issues.push(`${slug}: difficultySource without difficulty`);
    if (o.tagsSource !== undefined && o.tags === undefined) issues.push(`${slug}: tagsSource without tags`);
    const tags = o.tags ? [...o.tags].sort() : [];
    const tagsSource = o.tags && o.tags.length > 0 ? (o.tagsSource ?? "owner") : null;

    if (bySlug.has(slug)) {
      if (o.n !== undefined || o.title !== undefined || o.rating !== undefined) {
        issues.push(`${slug}: number, title and rating come from the catalog; remove them from the overlay`);
        continue;
      }
      const p = out[index.get(slug)!];
      if (o.difficulty !== undefined) {
        p.difficulty = o.difficulty;
        p.difficultySource = o.difficultySource ?? "owner";
      }
      p.tags = tags;
      p.tagsSource = tagsSource;
      p.premium = o.premium ?? false;
      p.exclude = o.exclude ?? false;
      continue;
    }

    if (o.n === undefined || o.title === undefined) {
      issues.push(`${slug}: not in the catalog, so it needs a number (n) and a title`);
      continue;
    }
    if (numbers.has(o.n)) {
      issues.push(`${slug}: number ${o.n} is already used`);
      continue;
    }
    numbers.add(o.n);
    const rating = o.rating ?? null;
    const difficulty = o.difficulty ?? (rating !== null ? difficultyFromRating(rating) : null);
    out.push({
      n: o.n,
      slug,
      title: o.title,
      rating,
      ratingSource: rating !== null ? (o.ratingSource ?? "owner") : null,
      difficulty,
      difficultySource: o.difficulty !== undefined ? (o.difficultySource ?? "owner") : rating !== null ? "rating" : null,
      tags,
      tagsSource,
      contest: null,
      q: null,
      premium: o.premium ?? false,
      exclude: o.exclude ?? false,
    });
  }
  if (issues.length > 0) return { ok: false, issues };
  out.sort((a, b) => a.n - b.n);
  return { ok: true, problems: out };
}

/** Never drawn, searched or offered: paid-only or excluded by the owner. */
export function isHidden(p: Pick<LeetCodeProblem, "premium" | "exclude">): boolean {
  return p.premium || p.exclude;
}
