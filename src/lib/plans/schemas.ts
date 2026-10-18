// Study plans (docs/specs/community.md §B.8, §C.2; phase C2): limits and the
// request bodies of /api/plans/**. Pure module shared by the route handlers
// and the client forms. Every object is strict (extra keys → 400). Text is
// plain text (no markdown in C2): rendered as React text, never as HTML.
import { z } from "zod";

import { parseLeetCodeProblemUrl } from "./leetcode";

export const PLAN_TITLE_MAX = 80;
export const PLAN_DESCRIPTION_MAX = 2000;
export const SECTION_TITLE_MAX = 80;
export const ITEM_NOTE_MAX = 280;
export const EXTERNAL_TITLE_MAX = 120;
/** §B.8 limits. */
export const MAX_PLANS_PER_USER = 50;
export const MAX_SECTIONS_PER_PLAN = 20;
export const MAX_ITEMS_PER_PLAN = 300;
/** Items in one POST /api/plans/[id]/items. */
export const MAX_ITEMS_PER_BATCH = 50;
/** Plan bodies are small; the layout of a full plan (300 ids + 20 sections) is the largest. */
export const PLAN_BODY_MAX_BYTES = 32 * 1024;
export const PLAN_SEARCH_MAX = 80;

export const PLAN_VISIBILITIES = ["private", "unlisted", "public"] as const;
export type PlanVisibility = (typeof PLAN_VISIBILITIES)[number];
export const PLAN_SOURCES = ["manual", "interview_post", "room_session", "clone"] as const;
export type PlanSource = (typeof PLAN_SOURCES)[number];

/** Share tokens: 32 random bytes as base64url (43 characters), like room invites. */
export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// Controls (incl. U+0000) and the bidi overrides/isolates that can make a
// title read differently from what it is.
const CONTROL_CHARS = /\p{Cc}/u;
const BIDI_CONTROLS = /[‪-‮⁦-⁩]/u;

/** Length in code points, like Postgres `char_length` (the DB CHECKs). */
export function textLength(s: string): number {
  return [...s].length;
}

/** One line of plain text: trimmed, inner whitespace runs collapsed, 1..max code points. */
function lineSchema(what: string, max: number) {
  return z
    .string(`Enter a ${what}`)
    .transform((s) => s.replace(/[ \t ]+/g, " ").trim())
    .refine((s) => s.length > 0, `Enter a ${what}`)
    .refine((s) => textLength(s) <= max, `Use at most ${max} characters`)
    .refine((s) => !CONTROL_CHARS.test(s) && !BIDI_CONTROLS.test(s), `The ${what} contains characters that are not allowed`);
}

export const planTitleSchema = lineSchema("title", PLAN_TITLE_MAX);
export const sectionTitleSchema = lineSchema("section name", SECTION_TITLE_MAX);
export const externalTitleSchema = lineSchema("title", EXTERNAL_TITLE_MAX);

/** Optional one-line note ("" clears it). */
export const itemNoteSchema = z
  .string("Enter a note")
  .transform((s) => s.replace(/[ \t ]+/g, " ").trim())
  .refine((s) => textLength(s) <= ITEM_NOTE_MAX, `Use at most ${ITEM_NOTE_MAX} characters`)
  .refine((s) => !CONTROL_CHARS.test(s) && !BIDI_CONTROLS.test(s), "The note contains characters that are not allowed");

/** Plain-text description: newlines kept (CRLF → LF), other controls rejected, ≤ 2000. "" = none. */
export const planDescriptionSchema = z
  .string("Enter a description")
  .transform((s) => s.replace(/\r\n?/g, "\n").trim())
  .refine((s) => textLength(s) <= PLAN_DESCRIPTION_MAX, `Use at most ${PLAN_DESCRIPTION_MAX} characters`)
  .refine(
    (s) => !CONTROL_CHARS.test(s.replace(/\n/g, "")) && !BIDI_CONTROLS.test(s),
    "The description contains characters that are not allowed",
  )
  .refine((s) => !/\n{4,}/.test(s), "Use at most two blank lines in a row");

export const planVisibilitySchema = z.enum(PLAN_VISIBILITIES, "Choose who can see the plan");

const uuidSchema = z.uuid("Unknown id");
/** A share token as sent by a client (wrong format = no access, same 404 as a wrong token). */
export const shareTokenInputSchema = z.string().max(64).optional();

const problemSlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Unknown problem").max(100);

/** A LeetCode problem link, normalized to its slug (the only part stored). */
export const leetCodeUrlSchema = z
  .string("Paste a LeetCode problem link")
  .transform((s, ctx) => {
    const slug = parseLeetCodeProblemUrl(s);
    if (!slug) {
      ctx.addIssue({ code: "custom", message: "Paste a link like https://leetcode.com/problems/two-sum/" });
      return z.NEVER;
    }
    return slug;
  });

export const createPlanBodySchema = z.strictObject({
  title: planTitleSchema,
  description: planDescriptionSchema.optional(),
  visibility: planVisibilitySchema.optional(),
});

export const updatePlanBodySchema = z
  .strictObject({
    title: planTitleSchema.optional(),
    description: planDescriptionSchema.optional(),
    visibility: planVisibilitySchema.optional(),
    /** New share link (the old one stops working). */
    resetShareLink: z.literal(true).optional(),
  })
  .refine(
    (b) => b.title !== undefined || b.description !== undefined || b.visibility !== undefined || b.resetShareLink,
    "Nothing to change",
  );

export const emptyBodySchema = z.strictObject({});

/** Where new items go: an existing section, a section by name (created when missing) or the top list. */
const sectionTargetSchema = z.union([
  z.strictObject({ id: uuidSchema }),
  z.strictObject({ title: sectionTitleSchema }),
]);

export const newItemSchema = z.union([
  z.strictObject({ problemSlug: problemSlugSchema, note: itemNoteSchema.optional() }),
  z.strictObject({
    leetcodeUrl: leetCodeUrlSchema,
    title: externalTitleSchema.optional(),
    note: itemNoteSchema.optional(),
  }),
]);
export type NewItemInput = z.infer<typeof newItemSchema>;

export const addItemsBodySchema = z.strictObject({
  items: z.array(newItemSchema).min(1, "Add at least one problem").max(MAX_ITEMS_PER_BATCH, `Add at most ${MAX_ITEMS_PER_BATCH} at a time`),
  section: sectionTargetSchema.optional(),
});

/** Add to a new plan in one step (the add-to-plan dialog's "New plan"). */
export const createPlanWithItemsBodySchema = createPlanBodySchema.extend({
  items: addItemsBodySchema.shape.items.optional(),
  section: z.strictObject({ title: sectionTitleSchema }).optional(),
});

export const updateItemBodySchema = z
  .strictObject({
    note: itemNoteSchema.optional(),
    /** External items only. */
    title: externalTitleSchema.optional(),
  })
  .refine((b) => b.note !== undefined || b.title !== undefined, "Nothing to change");

/**
 * The whole order of a plan: the unsectioned items first, then every section
 * with its items. Must name exactly the plan's sections and items (a
 * permutation), so a stale client gets 409 instead of losing items.
 */
export const layoutBodySchema = z.strictObject({
  unsectioned: z.array(uuidSchema).max(MAX_ITEMS_PER_PLAN),
  sections: z
    .array(z.strictObject({ id: uuidSchema, items: z.array(uuidSchema).max(MAX_ITEMS_PER_PLAN) }))
    .max(MAX_SECTIONS_PER_PLAN),
});
export type LayoutBody = z.infer<typeof layoutBodySchema>;

export const createSectionBodySchema = z.strictObject({ title: sectionTitleSchema });
export const renameSectionBodySchema = z.strictObject({ title: sectionTitleSchema });

export const tickBodySchema = z.strictObject({ done: z.boolean(), share: shareTokenInputSchema });
export const saveBodySchema = z.strictObject({ saved: z.boolean(), share: shareTokenInputSchema });
export const duplicateBodySchema = z.strictObject({ share: shareTokenInputSchema });

export const importBodySchema = z.strictObject({
  source: z.literal("room_session"),
  sessionId: uuidSchema,
});

export const PLAN_SORTS = ["popular", "new"] as const;
export type PlanSort = (typeof PLAN_SORTS)[number];

/** `/plans` discover filters from the URL (invalid values fall back to defaults, never 400). */
export function parseDiscoverParams(params: Record<string, string | string[] | undefined>): {
  q: string;
  sort: PlanSort;
  page: number;
} {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const rawQ = one(params.q).replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim();
  const q = [...rawQ].slice(0, PLAN_SEARCH_MAX).join("");
  const sort: PlanSort = one(params.sort) === "new" ? "new" : "popular";
  const n = Number(one(params.page));
  const page = Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
  return { q, sort, page };
}
