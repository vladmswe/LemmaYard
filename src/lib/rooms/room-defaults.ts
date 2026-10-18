// Room profile, session presets and the weekly schedule (Rooms v2 §4, §5,
// §8, §11). Pure module: the settings UI (V2-2) reuses the same rules. Every
// object is strict (extra keys → 400).
import { z } from "zod";

import { roomNameSchema } from "./schemas";
import { durationMinSchema, problemCountSchema, sessionTagsSchema } from "./session-schemas";

export { MIN_RATED_MINUTES_PER_PROBLEM, ratedByDefault } from "./session-schemas";
import {
  CHALLENGES,
  DEFAULT_DURATION_MIN,
  DEFAULT_PROBLEM_COUNT,
  DEFAULT_SELECTION_MODE,
  mixSchema,
  mixTotal,
  SELECTION_MODES,
  type Challenge,
  type Mix,
  type SelectionMode,
} from "./types";

export const ROOM_DESCRIPTION_MAX = 200;
/** Palette index 0..7 (design tokens; the UI maps the index to a color). */
export const ROOM_COLOR_COUNT = 8;
export const MAX_PRESETS = 5;
export const PRESET_NAME_MAX = 30;
/** jsonb size bounds, mirrored by CHECKs in migration 0004. */
export const PRESETS_MAX_BYTES = 4096;
export const SCHEDULE_MAX_BYTES = 512;
/** Id of the preset a room has before its owner saves any (never stored). */
export const CODE_DEFAULT_PRESET_ID = "default";

const CONTROL_CHARS = /\p{Cc}/u;
const PRESET_ID = /^[A-Za-z0-9_-]{1,16}$/;
const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export type SessionTemplate = {
  id: string;
  name: string;
  problemCount: number;
  durationMin: number;
  mode: SelectionMode;
  challenge: Challenge;
  tags: string[];
  /** Difficulty mode with a custom mix only. */
  mix?: Mix;
  avoidSolved: boolean;
  rated: boolean;
};

export type RoomSchedule = {
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** "HH:MM", 24 h, wall clock in `timeZone`. */
  time: string;
  /** IANA zone name. */
  timeZone: string;
  presetId: string | null;
};

export const roomDescriptionSchema = z
  .string("Enter a description")
  .trim()
  .refine((s) => [...s].length <= ROOM_DESCRIPTION_MAX, `Use at most ${ROOM_DESCRIPTION_MAX} characters`)
  .refine((s) => !CONTROL_CHARS.test(s), "The description contains characters that are not allowed");

export const roomColorSchema = z
  .number("Choose a color")
  .int("Choose a color")
  .min(0, "Choose a color")
  .max(ROOM_COLOR_COUNT - 1, "Choose a color");

export const presetIdSchema = z.string().regex(PRESET_ID, "Unknown preset");

export const presetNameSchema = z
  .string("Name the preset")
  .trim()
  .refine((s) => s.length > 0, "Name the preset")
  .refine((s) => [...s].length <= PRESET_NAME_MAX, `Use at most ${PRESET_NAME_MAX} characters`)
  .refine((s) => !CONTROL_CHARS.test(s), "The name contains characters that are not allowed");

export const sessionTemplateSchema = z
  .strictObject({
    id: presetIdSchema,
    name: presetNameSchema,
    problemCount: problemCountSchema,
    durationMin: durationMinSchema,
    mode: z.enum(SELECTION_MODES),
    challenge: z.enum(CHALLENGES),
    tags: sessionTagsSchema,
    mix: mixSchema.optional(),
    avoidSolved: z.boolean(),
    rated: z.boolean(),
  })
  .superRefine((t, ctx) => {
    if (t.mix === undefined) return;
    if (t.mode !== "difficulty") {
      ctx.addIssue({ code: "custom", path: ["mix"], message: "A custom mix is only used by the difficulty mode" });
    } else if (mixTotal(t.mix) !== t.problemCount) {
      ctx.addIssue({ code: "custom", path: ["mix"], message: `The custom mix must add up to ${t.problemCount}` });
    }
  });

/** Stored list (`rooms.presets`): ≤ 5, unique ids. */
export const presetsSchema = z
  .array(sessionTemplateSchema)
  .max(MAX_PRESETS, `A room keeps at most ${MAX_PRESETS} presets`)
  .refine((list) => new Set(list.map((p) => p.id)).size === list.length, "Each preset id once");

/**
 * An IANA zone name the runtime knows. `Intl.supportedValuesOf` lists only
 * canonical ICU names ("Europe/Kiev", not "Europe/Kyiv"), so the check asks
 * `Intl.DateTimeFormat`, which also accepts the current aliases.
 */
function isTimeZone(zone: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(zone)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export const roomScheduleSchema = z.strictObject({
  weekday: z.number("Choose a weekday").int("Choose a weekday").min(0, "Choose a weekday").max(6, "Choose a weekday"),
  time: z.string("Enter a time").regex(TIME_HHMM, "Use 24-hour time, e.g. 18:00"),
  timeZone: z.string("Choose a time zone").max(64).refine(isTimeZone, "Unknown time zone"),
  presetId: presetIdSchema.nullable(),
});

// --- Request bodies (§11) -------------------------------------------------

/** POST /api/rooms: v1 name plus the optional v2 profile fields. */
export const createRoomV2BodySchema = z.strictObject({
  name: roomNameSchema,
  description: roomDescriptionSchema.optional(),
  color: roomColorSchema.optional(),
});

/** POST /api/rooms/:roomId/profile (owner). At least one field. */
export const roomProfileBodySchema = z
  .strictObject({
    name: roomNameSchema.optional(),
    description: roomDescriptionSchema.nullable().optional(),
    color: roomColorSchema.optional(),
  })
  .refine((b) => b.name !== undefined || b.description !== undefined || b.color !== undefined, "Nothing to change");

/** A preset as sent by the client: the server assigns the id of a new one. */
export const presetInputSchema = z.strictObject({
  id: presetIdSchema.optional(),
  name: presetNameSchema,
  problemCount: problemCountSchema,
  durationMin: durationMinSchema,
  mode: z.enum(SELECTION_MODES),
  challenge: z.enum(CHALLENGES),
  tags: sessionTagsSchema,
  mix: mixSchema.optional(),
  avoidSolved: z.boolean(),
  rated: z.boolean(),
});
export type PresetInput = z.infer<typeof presetInputSchema>;

/** POST /api/rooms/:roomId/presets (owner). */
export const presetsBodySchema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("save"), preset: presetInputSchema, makeDefault: z.boolean().optional() }),
  z.strictObject({ action: z.literal("delete"), id: presetIdSchema }),
  z.strictObject({ action: z.literal("default"), id: presetIdSchema }),
]);
export type PresetsBody = z.infer<typeof presetsBodySchema>;

/** POST /api/rooms/:roomId/schedule (owner); null clears it. */
export const scheduleBodySchema = z.strictObject({ schedule: roomScheduleSchema.nullable() });

// --- Pure helpers ----------------------------------------------------------

/** The preset of a room that never saved one (§4 "Seeding", D1: by rating). */
export const CODE_DEFAULT_PRESET: SessionTemplate = {
  id: CODE_DEFAULT_PRESET_ID,
  name: "Default",
  problemCount: DEFAULT_PROBLEM_COUNT,
  durationMin: DEFAULT_DURATION_MIN,
  mode: DEFAULT_SELECTION_MODE,
  challenge: "balanced",
  tags: [],
  avoidSolved: true,
  rated: true,
};

/**
 * The room's presets as the UI and the session create see them: NULL in the
 * DB (never saved) reads as the code default, without a data migration.
 * A stored value that fails validation also falls back (defensive).
 */
export function resolvePresets(stored: unknown): SessionTemplate[] {
  if (stored === null || stored === undefined) return [{ ...CODE_DEFAULT_PRESET }];
  const parsed = presetsSchema.safeParse(stored);
  if (!parsed.success || parsed.data.length === 0) return [{ ...CODE_DEFAULT_PRESET }];
  return parsed.data;
}

/** The default preset: `defaultPresetId` when it exists, else the first one. */
export function defaultPreset(presets: readonly SessionTemplate[], defaultPresetId: string | null): SessionTemplate {
  return presets.find((p) => p.id === defaultPresetId) ?? presets[0] ?? CODE_DEFAULT_PRESET;
}

/** jsonb byte length as Postgres counts it for `octet_length(x::text)` (close enough: JSON text). */
export function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export type PresetChange =
  | { ok: true; presets: SessionTemplate[]; defaultPresetId: string | null; preset?: SessionTemplate }
  | { ok: false; status: 404 | 409; code: "preset_not_found" | "too_many_presets" | "presets_too_large" | "last_preset"; error: string };

/**
 * Applies one presets action to the current list (pure). A save without an
 * id adds a preset (409 beyond 5), a save with a known id replaces it.
 */
export function applyPresetsAction(
  current: readonly SessionTemplate[],
  defaultPresetId: string | null,
  body: PresetsBody,
  newId: () => string,
): PresetChange {
  const list = current.map((p) => ({ ...p }));
  const notFound = { ok: false, status: 404, code: "preset_not_found", error: "Preset not found" } as const;
  if (body.action === "save") {
    const { id, ...fields } = body.preset;
    if (fields.mix !== undefined && fields.mode !== "difficulty") delete fields.mix;
    let preset: SessionTemplate;
    let next: SessionTemplate[];
    if (id !== undefined) {
      const i = list.findIndex((p) => p.id === id);
      if (i < 0) return notFound;
      preset = { ...fields, id };
      next = list.map((p, j) => (j === i ? preset : p));
    } else {
      if (list.length >= MAX_PRESETS) {
        return { ok: false, status: 409, code: "too_many_presets", error: `A room keeps at most ${MAX_PRESETS} presets. Delete one first.` };
      }
      let fresh = newId();
      while (list.some((p) => p.id === fresh)) fresh = newId();
      preset = { ...fields, id: fresh };
      next = [...list, preset];
    }
    const parsed = presetsSchema.safeParse(next);
    if (!parsed.success) {
      return { ok: false, status: 409, code: "too_many_presets", error: parsed.error.issues[0]?.message ?? "Invalid preset" };
    }
    if (jsonBytes(next) > PRESETS_MAX_BYTES) {
      return { ok: false, status: 409, code: "presets_too_large", error: "The presets are too large. Shorten names or topics." };
    }
    return {
      ok: true,
      presets: next,
      defaultPresetId: body.makeDefault ? preset.id : (defaultPresetId ?? next[0].id),
      preset,
    };
  }
  if (body.action === "delete") {
    if (!list.some((p) => p.id === body.id)) return notFound;
    if (list.length === 1) {
      return { ok: false, status: 409, code: "last_preset", error: "A room keeps at least one preset" };
    }
    const next = list.filter((p) => p.id !== body.id);
    const keepDefault = defaultPresetId !== null && defaultPresetId !== body.id && next.some((p) => p.id === defaultPresetId);
    return { ok: true, presets: next, defaultPresetId: keepDefault ? defaultPresetId : next[0].id };
  }
  if (!list.some((p) => p.id === body.id)) return notFound;
  return { ok: true, presets: list, defaultPresetId: body.id };
}

/** Room profile and defaults as the room page and GET /api/rooms/:roomId see them. */
export type RoomDefaultsView = {
  description: string | null;
  color: number;
  /** Never empty: a room that never saved presets shows the code default. */
  presets: SessionTemplate[];
  defaultPresetId: string;
  schedule: RoomSchedule | null;
};

type RoomDefaultsRow = {
  description: string | null;
  color: number;
  presets: unknown;
  defaultPresetId: string | null;
  schedule: unknown;
};

export function roomDefaultsView(row: RoomDefaultsRow): RoomDefaultsView {
  const presets = resolvePresets(row.presets);
  const schedule = scheduleBodySchema.shape.schedule.safeParse(row.schedule ?? null);
  return {
    description: row.description,
    color: row.color,
    presets,
    defaultPresetId: defaultPreset(presets, row.defaultPresetId).id,
    schedule: schedule.success ? schedule.data : null,
  };
}

/** Random 8-character preset id (nanoid alphabet). */
export function newPresetId(): string {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => alphabet[b & 63]).join("");
}
