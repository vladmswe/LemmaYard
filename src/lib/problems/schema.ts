// Zod schemas for problem files (`problems/<slug>/meta.json`, `tests.json`),
// PLAN.md section 5. Shared by the importer and later code.
import { z } from "zod";

import { isValidTypeString, parseType } from "@/lib/types";

import { identifierProblem } from "./identifiers";

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const identifier = z.string().superRefine((name, ctx) => {
  const problem = identifierProblem(name);
  if (problem) ctx.addIssue({ code: "custom", message: problem });
});

const typeString = z.string().superRefine((type, ctx) => {
  if (!isValidTypeString(type)) {
    ctx.addIssue({
      code: "custom",
      message: `unknown type "${type}" (use int, float, bool, string, T[] or T[][])`,
    });
  }
});

export const signatureSchema = z
  .strictObject({
    name: identifier,
    params: z
      .array(z.strictObject({ name: identifier, type: typeString }))
      .min(1, "at least one parameter is required"),
    returns: typeString,
  })
  .superRefine((sig, ctx) => {
    const seen = new Set<string>();
    sig.params.forEach((p, i) => {
      if (seen.has(p.name)) {
        ctx.addIssue({
          code: "custom",
          path: ["params", i, "name"],
          message: `duplicate parameter name "${p.name}"`,
        });
      }
      seen.add(p.name);
    });
  });

export const compareSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("exact") }),
  z.strictObject({ mode: z.literal("unordered") }),
  z.strictObject({
    mode: z.literal("float"),
    epsilon: z
      .number({ error: "epsilon is required when compare.mode is \"float\"" })
      .positive("epsilon must be > 0"),
  }),
]);

export const MAX_PROBLEM_NUMBER = 999_999_999;

export const DEFAULT_LIMITS = { timeMs: 2000, memoryMb: 256 } as const;

export const limitsSchema = z.strictObject({
  timeMs: z.int().min(100).max(10_000),
  memoryMb: z.int().min(32).max(1024),
});

/** Rooms v2 §8: the author's rating in meta.json (`problems.author_rating`, same CHECK). */
export const AUTHOR_RATING_MIN = 800;
export const AUTHOR_RATING_MAX = 3000;

/** Rooms v2 §8: usual rating range per difficulty; outside it `problems:verify` warns (no error). */
export const DIFFICULTY_RATING_BANDS: Readonly<Record<"easy" | "medium" | "hard", readonly [number, number]>> = {
  easy: [1000, 1450],
  medium: [1450, 1850],
  hard: [1850, 2400],
};

/** The verify warning for a rating outside its difficulty's band, or null. */
export function ratingBandWarning(meta: { slug: string; difficulty: "easy" | "medium" | "hard"; rating?: number }): string | null {
  if (meta.rating === undefined) return null;
  const [lo, hi] = DIFFICULTY_RATING_BANDS[meta.difficulty];
  if (meta.rating >= lo && meta.rating <= hi) return null;
  return `${meta.slug}: rating ${meta.rating} is outside the usual ${meta.difficulty} band ${lo}–${hi}`;
}

export const metaSchema = z
  .strictObject({
    // Upper bound keeps `number + NUMBER_PARK_OFFSET` (importer) within int4.
    number: z.int().positive().max(MAX_PROBLEM_NUMBER),
    slug: z.string().regex(slugRe, "slug must be kebab-case: [a-z0-9]+(-[a-z0-9]+)*"),
    title: z.string().trim().min(1),
    difficulty: z.enum(["easy", "medium", "hard"]),
    /** Optional author rating (Rooms v2); absent → band default by difficulty. */
    rating: z
      .int("rating must be a whole number")
      .min(AUTHOR_RATING_MIN, `rating must be ${AUTHOR_RATING_MIN}–${AUTHOR_RATING_MAX}`)
      .max(AUTHOR_RATING_MAX, `rating must be ${AUTHOR_RATING_MIN}–${AUTHOR_RATING_MAX}`)
      .optional(),
    tags: z
      .array(z.string().regex(slugRe, "tag must be kebab-case: [a-z0-9]+(-[a-z0-9]+)*"))
      .refine((tags) => new Set(tags).size === tags.length, "duplicate tags"),
    signature: signatureSchema,
    compare: compareSchema,
    limits: limitsSchema.default(DEFAULT_LIMITS),
  })
  .superRefine((meta, ctx) => {
    const returns = parseType(meta.signature.returns);
    if (!returns) return;
    let base = returns;
    while (base.kind === "array") base = base.of;
    const floatReturn = base.name === "float";
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", path: ["compare", "mode"], message });
    if (meta.compare.mode === "unordered" && returns.kind !== "array") {
      issue('"unordered" requires an array return type');
    }
    if (meta.compare.mode === "float" && !floatReturn) {
      issue('"float" requires a float return type (float, float[] or float[][])');
    }
    if (meta.compare.mode === "exact" && floatReturn) {
      issue('"exact" cannot compare a float return type; use "float" with an epsilon');
    }
  });

export const MIN_TESTS = 5;

// `z.record` silently drops an own "__proto__" key (JSON.parse creates one),
// so it is rejected on the raw value before the record is built.
const testInputSchema = z
  .unknown()
  .superRefine((value, ctx) => {
    if (typeof value === "object" && value !== null && Object.hasOwn(value, "__proto__")) {
      ctx.addIssue({ code: "custom", message: 'unknown parameter "__proto__"' });
    }
  })
  .pipe(z.record(z.string(), z.json()));

export const testCaseSchema = z.strictObject({
  input: testInputSchema,
  expected: z.json(),
  sample: z.boolean().default(false),
});

export const testsSchema = z
  .array(testCaseSchema)
  .min(MIN_TESTS, `at least ${MIN_TESTS} tests are required`)
  .refine((tests) => tests.some((t) => t.sample), "at least one test must have \"sample\": true");

export type Signature = z.infer<typeof signatureSchema>;
export type CompareSpec = z.infer<typeof compareSchema>;
export type ProblemMeta = z.infer<typeof metaSchema>;
export type ProblemTest = z.infer<typeof testCaseSchema>;
