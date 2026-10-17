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

export const DEFAULT_LIMITS = { timeMs: 2000, memoryMb: 256 } as const;

export const limitsSchema = z.strictObject({
  timeMs: z.int().min(100).max(10_000),
  memoryMb: z.int().min(32).max(1024),
});

export const metaSchema = z
  .strictObject({
    number: z.int().positive(),
    slug: z.string().regex(slugRe, "slug must be kebab-case: [a-z0-9]+(-[a-z0-9]+)*"),
    title: z.string().trim().min(1),
    difficulty: z.enum(["easy", "medium", "hard"]),
    tags: z
      .array(z.string().regex(slugRe, "tag must be kebab-case: [a-z0-9]+(-[a-z0-9]+)*"))
      .refine((tags) => new Set(tags).size === tags.length, "duplicate tags"),
    signature: signatureSchema,
    compare: compareSchema,
    limits: limitsSchema.default(DEFAULT_LIMITS),
  })
  .superRefine((meta, ctx) => {
    const returns = parseType(meta.signature.returns);
    if (meta.compare.mode === "unordered" && returns && returns.kind !== "array") {
      ctx.addIssue({
        code: "custom",
        path: ["compare", "mode"],
        message: '"unordered" requires an array return type',
      });
    }
  });

export const MIN_TESTS = 5;

export const testCaseSchema = z.strictObject({
  input: z.record(z.string(), z.json()),
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
