// Zod schemas of the community API (docs/specs/community.md §C.2), shared by
// the route handlers and the client forms. Strict objects: unknown keys are
// a 400, like the rooms API.
import { z } from "zod";

import { bodyProblem, hasForbiddenControl } from "./body";
import {
  COMMENT_SORTS,
  COMMUNITY_LIMITS,
  MOD_ACTIONS,
  REPORT_REASONS,
} from "./types";

const PROBLEM_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `problem:<slug>` (C1). C3/C5 add `post:<id>`, `lesson:<slug>`, `session:<id>`. */
export const commentTargetSchema = z
  .string()
  .max(120)
  .regex(/^problem:[a-z0-9-]{1,100}$/, "Unknown discussion target")
  .transform((value) => ({ kind: "problem" as const, slug: value.slice("problem:".length) }))
  .refine((t) => PROBLEM_SLUG.test(t.slug), "Unknown discussion target");

export type CommentTarget = z.output<typeof commentTargetSchema>;

const bodySchema = z
  .string()
  // Size first, so a megabyte of text never reaches the code-block scanner.
  .max(COMMUNITY_LIMITS.bodyMaxChars * 2, `At most ${COMMUNITY_LIMITS.bodyMaxChars.toLocaleString("en-US")} characters.`)
  .superRefine((value, ctx) => {
    const problem = bodyProblem(value);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  })
  .transform((value) => value.trim());

export const createCommentSchema = z
  .object({
    target: commentTargetSchema,
    parentId: z.uuid().nullish(),
    body: bodySchema,
    hasSpoiler: z.boolean().default(false),
  })
  .strict();

export const editCommentSchema = z
  .object({
    body: bodySchema,
    hasSpoiler: z.boolean().optional(),
  })
  .strict();

export const deleteCommentSchema = z.object({}).strict();

export const voteSchema = z
  .object({ value: z.union([z.literal(-1), z.literal(0), z.literal(1)]) })
  .strict();

export const difficultyFeedbackSchema = z
  .object({ value: z.union([z.literal(-1), z.literal(0), z.literal(1)]).nullable() })
  .strict();

const optionalText = (max: number) =>
  z
    .string()
    .max(max, `At most ${max} characters.`)
    .refine((v) => !hasForbiddenControl(v), "The text contains control characters.")
    .transform((v) => v.trim())
    .optional();

export const reportSchema = z
  .object({
    targetType: z.literal("comment"),
    targetId: z.uuid(),
    reason: z.enum(REPORT_REASONS),
    details: optionalText(COMMUNITY_LIMITS.reportDetailsMax),
  })
  .strict();

/** C1 moderator actions; the C3/C4 ones (void votes, companies) answer 400 until then. */
export const C1_MOD_ACTIONS = [
  "hide",
  "restore",
  "remove",
  "lock",
  "unlock",
  "set_spoiler",
  "suspend",
  "unsuspend",
  "dismiss",
] as const satisfies readonly (typeof MOD_ACTIONS)[number][];

export const modActionSchema = z
  .object({
    action: z.enum(C1_MOD_ACTIONS),
    targetType: z.enum(["comment", "thread", "user"]),
    targetId: z.uuid(),
    reason: z
      .string()
      .min(1, "Give a reason.")
      .max(COMMUNITY_LIMITS.modReasonMax, `At most ${COMMUNITY_LIMITS.modReasonMax} characters.`)
      .refine((v) => !hasForbiddenControl(v), "The text contains control characters.")
      .transform((v) => v.trim())
      .refine((v) => v.length > 0, "Give a reason."),
    /** suspend: length in days (7 or 30). */
    days: z.union([z.literal(7), z.literal(30)]).optional(),
    /** set_spoiler: the new flag (default true). */
    value: z.boolean().optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const needs: Record<string, string> = {
      hide: "comment",
      restore: "comment",
      remove: "comment",
      set_spoiler: "comment",
      dismiss: "comment",
      lock: "thread",
      unlock: "thread",
      suspend: "user",
      unsuspend: "user",
    };
    if (needs[v.action] !== v.targetType) {
      ctx.addIssue({ code: "custom", path: ["targetType"], message: `${v.action} applies to a ${needs[v.action]}` });
    }
    if (v.action === "suspend" && v.days === undefined) {
      ctx.addIssue({ code: "custom", path: ["days"], message: "Choose 7 or 30 days." });
    }
  });

export type ModActionInput = z.output<typeof modActionSchema>;

/** Query of `GET /api/comments`. */
export const listCommentsQuerySchema = z
  .object({
    target: commentTargetSchema,
    sort: z.enum(COMMENT_SORTS).default("best"),
    cursor: z.string().max(400).optional(),
  })
  .strict();

export const repliesQuerySchema = z.object({ cursor: z.string().max(400).optional() }).strict();
