// LeetCode problems in rooms (docs/specs/rooms-external-problems.md): strict
// URL parsing, the room's LeetCode list ("bank") and the request bodies of the
// external-slot and self-report routes. Pure module, shared by the server and
// the forms. We never fetch anything from leetcode.com: a LeetCode problem is
// a slug we turn into a link, plus an honor-system result.
import { z } from "zod";

import { DIFFICULTIES, type Difficulty } from "./types";

export const LEETCODE_ORIGIN = "https://leetcode.com";
export const EXTERNAL_SLUG_MAX = 100;
export const EXTERNAL_TITLE_MAX = 100;
export const EXTERNAL_URL_MAX = 300;
export const EXTERNAL_RATING_MIN = 0;
export const EXTERNAL_RATING_MAX = 4000;
/** Entries per room (409 beyond). */
export const MAX_BANK_ENTRIES = 100;

/** Lowercase letters, digits and single inner hyphens ("two-sum", "3sum-closest"). */
export const EXTERNAL_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The whole accepted input: https, host leetcode.com (scheme and host
 * case-insensitive, no userinfo, no port), `/problems/<slug>`, optional extra
 * lowercase path segments, an optional query and fragment without whitespace.
 * A regular expression on the raw string, deliberately not `new URL()`: the
 * WHATWG parser silently drops tabs and newlines, turns `\` into `/`, decodes
 * IDN and resolves dot segments, which would let hostile input through.
 */
const LEETCODE_URL_RE =
  /^[Hh][Tt][Tt][Pp][Ss]:\/\/[Ll][Ee][Ee][Tt][Cc][Oo][Dd][Ee]\.[Cc][Oo][Mm]\/problems\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*\/?(?:\?[\x21-\x7e]*)?(?:#[\x21-\x7e]*)?$/;

/** Invisible or direction-changing characters and control characters (never in a title). */
const UNSAFE_TEXT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

export type ParsedLeetCodeUrl = { ok: true; slug: string } | { ok: false; error: string };

export const URL_REQUIRED = "Paste a LeetCode problem link";
export const URL_INVALID = "Use a link like https://leetcode.com/problems/two-sum/";

/** Parses a pasted LeetCode problem link into its slug, or says why it is not one. */
export function parseLeetCodeUrl(raw: string): ParsedLeetCodeUrl {
  if (typeof raw !== "string") return { ok: false, error: URL_REQUIRED };
  const input = raw.trim();
  if (input.length === 0) return { ok: false, error: URL_REQUIRED };
  if (input.length > EXTERNAL_URL_MAX) return { ok: false, error: `Use at most ${EXTERNAL_URL_MAX} characters` };
  if (input.includes("\\")) return { ok: false, error: URL_INVALID };
  const m = LEETCODE_URL_RE.exec(input);
  if (!m) return { ok: false, error: URL_INVALID };
  const slug = m[1];
  if (slug.length > EXTERNAL_SLUG_MAX) return { ok: false, error: "This problem link is too long" };
  return { ok: true, slug };
}

export function isExternalSlug(slug: string): boolean {
  return slug.length >= 1 && slug.length <= EXTERNAL_SLUG_MAX && EXTERNAL_SLUG_RE.test(slug);
}

/** The canonical link, built on render from a validated slug (never a stored URL). */
export function leetcodeProblemUrl(slug: string): string {
  if (!isExternalSlug(slug)) throw new Error("invalid LeetCode slug");
  return `${LEETCODE_ORIGIN}/problems/${slug}/`;
}

/** Default title: "two-sum" → "Two Sum", "3sum-closest" → "3sum Closest". */
export function titleFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
    .slice(0, EXTERNAL_TITLE_MAX);
}

// --- Zod pieces ---------------------------------------------------------------

export const externalUrlSchema = z.string("Paste a LeetCode problem link").superRefine((v, ctx) => {
  const r = parseLeetCodeUrl(v);
  if (!r.ok) ctx.addIssue({ code: "custom", message: r.error });
});

/** Optional title: "" or absent = Title Case of the slug. */
export const externalTitleSchema = z
  .string("Enter a title")
  .trim()
  .refine((s) => [...s].length <= EXTERNAL_TITLE_MAX, `Use at most ${EXTERNAL_TITLE_MAX} characters`)
  .refine((s) => !UNSAFE_TEXT.test(s), "The title contains characters that are not allowed");

export const externalDifficultySchema = z.enum(DIFFICULTIES, "Choose easy, medium or hard").nullable();

export const externalRatingSchema = z
  .number("Enter a whole number")
  .int("Enter a whole number")
  .min(EXTERNAL_RATING_MIN, `Use ${EXTERNAL_RATING_MIN}–${EXTERNAL_RATING_MAX}`)
  .max(EXTERNAL_RATING_MAX, `Use ${EXTERNAL_RATING_MIN}–${EXTERNAL_RATING_MAX}`)
  .nullable();

const idSchema = z.uuid("Unknown problem");

/** Fields of a LeetCode problem as typed by a person (bank add, lobby paste). */
export const externalProblemInputSchema = z.strictObject({
  url: externalUrlSchema,
  title: externalTitleSchema.optional(),
  difficulty: externalDifficultySchema.optional(),
  rating: externalRatingSchema.optional(),
});
export type ExternalProblemInput = z.infer<typeof externalProblemInputSchema>;

/** POST /api/rooms/:roomId/external-problems (owner). */
export const bankBodySchema = z.discriminatedUnion("action", [
  externalProblemInputSchema.extend({ action: z.literal("add") }),
  z.strictObject({
    action: z.literal("update"),
    id: idSchema,
    url: externalUrlSchema.optional(),
    title: externalTitleSchema.optional(),
    difficulty: externalDifficultySchema.optional(),
    rating: externalRatingSchema.optional(),
  }),
  z.strictObject({ action: z.literal("delete"), id: idSchema }),
]);
export type BankBody = z.infer<typeof bankBodySchema>;

/** POST …/sessions/:sid/external (host or owner, lobby). */
export const sessionExternalBodySchema = z.union([
  z.strictObject({ action: z.literal("add"), bankId: idSchema }),
  externalProblemInputSchema.extend({ action: z.literal("add"), saveToBank: z.boolean().optional() }),
  z.strictObject({ action: z.literal("remove"), position: z.number().int().min(1).max(8) }),
]);
export type SessionExternalBody = z.infer<typeof sessionExternalBodySchema>;

/** POST …/slots/:position/self-report (participant, live). */
export const selfReportBodySchema = z.strictObject({ solved: z.boolean("Say whether you solved it") });

/** The title to store: the trimmed input, or Title Case of the slug when empty. */
export function resolveExternalTitle(slug: string, title?: string): string {
  const t = title?.trim() ?? "";
  return t.length > 0 ? t : titleFromSlug(slug);
}

/** The values to store for a typed problem: slug from the URL, default title, nulls for empty optionals. */
export function normalizeExternalInput(input: {
  url: string;
  title?: string;
  difficulty?: Difficulty | null;
  rating?: number | null;
}): { slug: string; title: string; difficulty: Difficulty | null; rating: number | null } {
  const parsed = parseLeetCodeUrl(input.url);
  if (!parsed.ok) throw new Error(parsed.error);
  const title = resolveExternalTitle(parsed.slug, input.title);
  return { slug: parsed.slug, title, difficulty: input.difficulty ?? null, rating: input.rating ?? null };
}

// --- Wire shapes ------------------------------------------------------------------

export type BankEntry = {
  id: string;
  slug: string;
  title: string;
  difficulty: Difficulty | null;
  rating: number | null;
  createdAt: string;
};

export type BankView = { problems: BankEntry[]; canEdit: boolean };

// --- Form (settings list and lobby "Paste a link") -----------------------------------

export type ExternalForm = {
  url: string;
  title: string;
  /** "" = not set. */
  difficulty: "" | Difficulty;
  /** Text of the number input; "" = not set. */
  rating: string;
};

export function emptyExternalForm(): ExternalForm {
  return { url: "", title: "", difficulty: "", rating: "" };
}

export function externalFormFrom(entry: Pick<BankEntry, "slug" | "title" | "difficulty" | "rating">): ExternalForm {
  return {
    url: `${LEETCODE_ORIGIN}/problems/${entry.slug}/`,
    title: entry.title,
    difficulty: entry.difficulty ?? "",
    rating: entry.rating === null ? "" : String(entry.rating),
  };
}

/**
 * Validates the form with the server's schemas (same messages). Returns the
 * body fields (`url`, `title`, `difficulty`, `rating`) or `{field: message}`.
 */
export function validateExternalForm(
  f: ExternalForm,
): { ok: true; input: ExternalProblemInput & { difficulty: Difficulty | null; rating: number | null } } | { ok: false; fieldErrors: Record<string, string> } {
  const ratingText = f.rating.trim();
  const rating = ratingText === "" ? null : /^\d{1,4}$/.test(ratingText) ? Number(ratingText) : Number.NaN;
  const parsed = externalProblemInputSchema.safeParse({
    url: f.url,
    title: f.title,
    difficulty: f.difficulty === "" ? null : f.difficulty,
    rating: Number.isNaN(rating) ? -1 : rating,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (fieldErrors[key] === undefined) fieldErrors[key] = issue.message;
    }
    if (Number.isNaN(rating)) fieldErrors.rating = `Enter a whole number ${EXTERNAL_RATING_MIN}–${EXTERNAL_RATING_MAX}, or leave it empty`;
    return { ok: false, fieldErrors };
  }
  return {
    ok: true,
    input: {
      url: parsed.data.url.trim(),
      title: parsed.data.title ?? "",
      difficulty: parsed.data.difficulty ?? null,
      rating: parsed.data.rating ?? null,
    },
  };
}

/** Copy shared by the UI (spec §5). */
export const SELF_REPORTED_LABEL = "SELF";
export const SELF_REPORTED_TOOLTIP = "Self-reported: marked solved on LeetCode, not checked by LemmaYard";
export const SELF_REPORTED_NOTE = "Includes self-reported LeetCode problems";
export const EXTERNAL_UNRATED_HELP =
  "LeetCode problems never change ratings; a session with only LeetCode problems is unrated.";
export const NEW_TAB_SR = " (opens leetcode.com in a new tab)";
