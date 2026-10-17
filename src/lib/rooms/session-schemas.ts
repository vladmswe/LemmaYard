// Request bodies and settings rules of the session routes (docs/specs/rooms.md
// §2.1, §2.5, §7.2). Pure module: the lobby form (R4) reuses the same rules.
// Every object is strict (extra keys → 400).
import { z } from "zod";

import {
  CHALLENGES,
  DEFAULT_DURATION_MIN,
  DEFAULT_PROBLEM_COUNT,
  DURATION_STEP_MIN,
  MAX_DURATION_MIN,
  MAX_PROBLEM_COUNT,
  MAX_SESSION_TAGS,
  MIN_DURATION_MIN,
  MIN_PROBLEM_COUNT,
  mixSchema,
  mixTotal,
  type Mix,
  type RoomSessionSettings,
} from "./types";

/** Spec §7.2: 10 session creates per room per hour (DB count). */
export const SESSION_CREATES_PER_HOUR = 10;
/** Spec §7.2: state polling 120 requests per minute per user (in-process, soft). */
export const STATE_POLLS_PER_MIN = 120;
export const STATE_RETRY_AFTER_SEC = 5;
/** Problem search: query length and result count (§7.2). */
export const PROBLEM_SEARCH_MAX_Q = 60;
export const PROBLEM_SEARCH_LIMIT = 10;
/** "Planned for" may lie at most this far ahead (sanity bound, not in the spec). */
export const PLANNED_FOR_MAX_DAYS = 366;

const TAG_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const problemCountSchema = z
  .number("Choose how many problems")
  .int("Use a whole number")
  .min(MIN_PROBLEM_COUNT, `Choose ${MIN_PROBLEM_COUNT}–${MAX_PROBLEM_COUNT} problems`)
  .max(MAX_PROBLEM_COUNT, `Choose ${MIN_PROBLEM_COUNT}–${MAX_PROBLEM_COUNT} problems`);

export const durationMinSchema = z
  .number("Choose a duration")
  .int("Use whole minutes")
  .min(MIN_DURATION_MIN, `Use ${MIN_DURATION_MIN}–${MAX_DURATION_MIN} minutes`)
  .max(MAX_DURATION_MIN, `Use ${MIN_DURATION_MIN}–${MAX_DURATION_MIN} minutes`)
  .refine((v) => v % DURATION_STEP_MIN === 0, `Use a multiple of ${DURATION_STEP_MIN} minutes`);

export const sessionTagsSchema = z
  .array(z.string().max(64).regex(TAG_SLUG, "Unknown topic"))
  .max(MAX_SESSION_TAGS, `Choose at most ${MAX_SESSION_TAGS} topics`)
  .refine((tags) => new Set(tags).size === tags.length, "Each topic once");

/**
 * Settings of POST /sessions and /draw. Every field is optional: create fills
 * the defaults, draw keeps the current value of an omitted field.
 */
export const sessionSettingsBodySchema = z.strictObject({
  problemCount: problemCountSchema.optional(),
  durationMin: durationMinSchema.optional(),
  tags: sessionTagsSchema.optional(),
  mixMode: z.enum(["suggested", "manual"]).optional(),
  mix: mixSchema.optional(),
  challenge: z.enum(CHALLENGES).optional(),
  avoidSolved: z.boolean().optional(),
  plannedFor: z.iso.datetime({ offset: true }).nullable().optional(),
});
export type SessionSettingsBody = z.infer<typeof sessionSettingsBodySchema>;

/** Body fields whose change re-draws the unpinned slots (§2.5 "Re-draw"). */
export const DRAW_FIELDS = ["problemCount", "tags", "mixMode", "mix", "challenge", "avoidSolved"] as const;

export function touchesDraw(body: SessionSettingsBody): boolean {
  return DRAW_FIELDS.some((k) => body[k] !== undefined);
}

export const pinBodySchema = z.union([
  z.strictObject({ slug: z.string().min(1).max(128) }),
  z.strictObject({ unpin: z.literal(true) }),
]);
export type PinBody = z.infer<typeof pinBodySchema>;

/** `?q=` of the problem search: 1–60 characters after trim, no control characters. */
export const problemSearchQuerySchema = z
  .string()
  .trim()
  .min(1, "Type part of a title")
  .max(PROBLEM_SEARCH_MAX_Q, `Use at most ${PROBLEM_SEARCH_MAX_Q} characters`)
  .refine((s) => !/\p{Cc}/u.test(s), "The search contains characters that are not allowed");

/** Slot position in a path segment: "1".."8"; anything else is a 404. */
export function parseSlotPosition(raw: string): number | null {
  if (!/^[1-8]$/.test(raw)) return null;
  return Number(raw);
}

export type ResolvedSettings = {
  problemCount: number;
  durationMin: number;
  plannedFor: Date | null;
  settings: RoomSessionSettings;
};

export type SettingsError = { status: 400; error: string; field: string };

export const DEFAULT_SESSION_SETTINGS: RoomSessionSettings = {
  tags: [],
  mixMode: "suggested",
  mix: { easy: 1, medium: 2, hard: 1 },
  challenge: "balanced",
  avoidSolved: true,
};

/**
 * Merges a body into the current settings (or the defaults for a new
 * session). A `mix` without `mixMode` means a custom mix. A custom mix must
 * add up to the problem count (400); a suggested mix is recomputed by the draw.
 */
export function resolveSettings(
  current: ResolvedSettings | null,
  body: SessionSettingsBody,
  now: Date,
): ResolvedSettings | SettingsError {
  const base: ResolvedSettings = current ?? {
    problemCount: DEFAULT_PROBLEM_COUNT,
    durationMin: DEFAULT_DURATION_MIN,
    plannedFor: null,
    settings: DEFAULT_SESSION_SETTINGS,
  };
  const problemCount = body.problemCount ?? base.problemCount;
  const mixMode = body.mixMode ?? (body.mix !== undefined ? "manual" : base.settings.mixMode);
  let mix: Mix = base.settings.mix;
  if (mixMode === "manual") {
    mix = body.mix ?? base.settings.mix;
    if (mixTotal(mix) !== problemCount) {
      return {
        status: 400,
        error: `The custom mix must add up to ${problemCount} problem${problemCount === 1 ? "" : "s"}`,
        field: "mix",
      };
    }
  }
  let plannedFor = base.plannedFor;
  if (body.plannedFor !== undefined) {
    plannedFor = body.plannedFor === null ? null : new Date(body.plannedFor);
    if (plannedFor && plannedFor.getTime() - now.getTime() > PLANNED_FOR_MAX_DAYS * 86_400_000) {
      return { status: 400, error: "Plan the session within the next year", field: "plannedFor" };
    }
  }
  return {
    problemCount,
    durationMin: body.durationMin ?? base.durationMin,
    plannedFor,
    settings: {
      tags: body.tags ? [...body.tags].sort() : base.settings.tags,
      mixMode,
      mix: { ...mix },
      challenge: body.challenge ?? base.settings.challenge,
      avoidSolved: body.avoidSolved ?? base.settings.avoidSolved,
    },
  };
}
