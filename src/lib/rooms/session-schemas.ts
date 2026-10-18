// Request bodies and settings rules of the session routes (docs/specs/rooms.md
// §2.1, §2.5, §7.2). Pure module: the lobby form (R4) reuses the same rules.
// Every object is strict (extra keys → 400).
import { z } from "zod";

import type { SessionTemplate } from "./room-defaults";
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
  SELECTION_MODES,
  externalCountOf,
  selectionModeOf,
  type Mix,
  type RoomSessionSettings,
  type SelectionMode,
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
  /** v2: "rating" | "difficulty" | "manual". Omitted with `mixMode`/`mix` present → "difficulty". */
  mode: z.enum(SELECTION_MODES).optional(),
  /** v2: whether the results change ratings. */
  rated: z.boolean().optional(),
  /** LeetCode slots at the end of the session (rooms-external-problems §1.2). */
  external: z
    .number("Choose how many LeetCode problems")
    .int("Use a whole number")
    .min(0, `Use 0–${MAX_PROBLEM_COUNT}`)
    .max(MAX_PROBLEM_COUNT, `Use 0–${MAX_PROBLEM_COUNT}`)
    .optional(),
  /** Auto-pick the LeetCode slots from the catalog (leetcode-integration §6.7). */
  leetcodeAuto: z.boolean().optional(),
});
export type SessionSettingsBody = z.infer<typeof sessionSettingsBodySchema>;

/** POST /sessions: the settings plus an optional preset (Rooms v2 §4); explicit fields override the preset. */
export const createSessionBodySchema = sessionSettingsBodySchema.extend({
  presetId: z.string().regex(/^[A-Za-z0-9_-]{1,16}$/, "Unknown preset").optional(),
});
export type CreateSessionBody = z.infer<typeof createSessionBodySchema>;

/** A session is unrated by default when it gives less than this many minutes per problem (v2 §6.2). */
export const MIN_RATED_MINUTES_PER_PROBLEM = 10;

/** Off by default for very short sessions (v2 §6.2: duration / N < 10 min). */
export function ratedByDefault(durationMin: number, problemCount: number, presetRated = true): boolean {
  return presetRated && durationMin / problemCount >= MIN_RATED_MINUTES_PER_PROBLEM;
}

/** Body fields whose change re-draws the unpinned slots (§2.5 "Re-draw"). */
export const DRAW_FIELDS = [
  "problemCount",
  "tags",
  "mixMode",
  "mix",
  "challenge",
  "avoidSolved",
  "mode",
  "external",
  "leetcodeAuto",
] as const;

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
  /** v2: `room_sessions.rated`. */
  rated: boolean;
};

export type SettingsError = { status: 400; error: string; field: string };

export const DEFAULT_SESSION_SETTINGS: RoomSessionSettings = {
  tags: [],
  mixMode: "suggested",
  mix: { easy: 1, medium: 2, hard: 1 },
  challenge: "balanced",
  avoidSolved: true,
};

/** The starting point of a new session created from a preset (v2 §4). */
export function settingsFromTemplate(template: SessionTemplate): ResolvedSettings {
  const settings: RoomSessionSettings = {
    tags: [...template.tags].sort(),
    mixMode: template.mix ? "manual" : "suggested",
    mix: template.mix ? { ...template.mix } : { ...DEFAULT_SESSION_SETTINGS.mix },
    challenge: template.challenge,
    avoidSolved: template.avoidSolved,
    mode: template.mode,
  };
  if (template.id !== "default") settings.presetId = template.id;
  if (template.external) settings.external = Math.min(template.external, template.problemCount);
  if (template.leetcodeAuto) settings.leetcodeAuto = true;
  return {
    problemCount: template.problemCount,
    durationMin: template.durationMin,
    plannedFor: null,
    settings,
    rated: ratedByDefault(template.durationMin, template.problemCount, template.rated),
  };
}

/**
 * Merges a body into the current settings (or the defaults for a new
 * session). A `mix` without `mixMode` means a custom mix. A custom mix must
 * add up to the problem count (400); a suggested mix is recomputed by the draw.
 */
export function resolveSettings(
  current: ResolvedSettings | null,
  body: SessionSettingsBody,
  now: Date,
  template?: SessionTemplate,
): ResolvedSettings | SettingsError {
  const base: ResolvedSettings =
    current ??
    (template
      ? settingsFromTemplate(template)
      : {
          problemCount: DEFAULT_PROBLEM_COUNT,
          durationMin: DEFAULT_DURATION_MIN,
          plannedFor: null,
          settings: DEFAULT_SESSION_SETTINGS,
          rated: true,
        });
  const problemCount = body.problemCount ?? base.problemCount;
  const durationMin = body.durationMin ?? base.durationMin;
  // An explicit difficulty mix (old lobby form) means the difficulty mode.
  const mode: SelectionMode =
    body.mode ?? (body.mixMode !== undefined || body.mix !== undefined ? "difficulty" : selectionModeOf(base.settings));
  const mixMode = body.mixMode ?? (body.mix !== undefined ? "manual" : base.settings.mixMode);
  // LeetCode slots stay at the end; the draw fills the rest (rooms-external-problems §1.2).
  const external = body.external ?? externalCountOf(base.settings);
  if (external > problemCount) {
    return {
      status: 400,
      error: `This session has ${external} LeetCode problem${external === 1 ? "" : "s"}; remove one first or choose more problems`,
      field: "problemCount",
    };
  }
  const drawn = problemCount - external;
  let mix: Mix = base.settings.mix;
  if (mixMode === "manual") {
    mix = body.mix ?? base.settings.mix;
    if (mixTotal(mix) !== drawn) {
      return {
        status: 400,
        error:
          external > 0
            ? `The custom mix must add up to ${drawn} problem${drawn === 1 ? "" : "s"} (${problemCount} minus ${external} from LeetCode)`
            : `The custom mix must add up to ${problemCount} problem${problemCount === 1 ? "" : "s"}`,
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
  const settings: RoomSessionSettings = {
    tags: body.tags ? [...body.tags].sort() : base.settings.tags,
    mixMode,
    mix: { ...mix },
    challenge: body.challenge ?? base.settings.challenge,
    avoidSolved: body.avoidSolved ?? base.settings.avoidSolved,
  };
  // Pre-v2 rows stay without `mode` until something changes it, so they read back unchanged.
  if (base.settings.mode !== undefined || body.mode !== undefined || mode !== "difficulty") settings.mode = mode;
  if (base.settings.presetId !== undefined) settings.presetId = base.settings.presetId;
  if (mode === "rating" && base.settings.targets !== undefined) settings.targets = [...base.settings.targets];
  if (external > 0) settings.external = external;
  const leetcodeAuto = body.leetcodeAuto ?? base.settings.leetcodeAuto ?? false;
  if (leetcodeAuto) settings.leetcodeAuto = true;
  if (base.settings.leetcodeRerolled !== undefined) settings.leetcodeRerolled = [...base.settings.leetcodeRerolled];
  // New sessions: short ones are unrated unless the body says otherwise; existing ones keep their flag.
  const rated =
    body.rated ?? (current ? current.rated : ratedByDefault(durationMin, problemCount, template ? template.rated : true));
  return { problemCount, durationMin, plannedFor, settings, rated };
}
