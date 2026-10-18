// Rooms v2 §4, §5, §11: preset/schedule/profile schemas, preset actions, and
// how a preset and the v2 body fields resolve into session settings.
import { describe, expect, it } from "vitest";

import { ratingBandWarning, metaSchema } from "@/lib/problems/schema";
import { selfRatingBodySchema } from "@/lib/rooms/rating-schemas";
import {
  applyPresetsAction,
  CODE_DEFAULT_PRESET,
  createRoomV2BodySchema,
  defaultPreset,
  presetsBodySchema,
  resolvePresets,
  roomDefaultsView,
  roomProfileBodySchema,
  roomScheduleSchema,
  sessionTemplateSchema,
  type SessionTemplate,
} from "@/lib/rooms/room-defaults";
import { createSessionBodySchema, ratedByDefault, resolveSettings, sessionSettingsBodySchema } from "@/lib/rooms/session-schemas";
import { selectionModeOf } from "@/lib/rooms/types";

const NOW = new Date("2026-10-18T12:00:00Z");

const preset = (over: Partial<SessionTemplate> = {}): SessionTemplate => ({
  id: "sat00001",
  name: "Saturday",
  problemCount: 4,
  durationMin: 90,
  mode: "rating",
  challenge: "balanced",
  tags: [],
  avoidSolved: true,
  rated: true,
  ...over,
});

let ids = 0;
const nextId = () => `p${String(++ids).padStart(7, "0")}`;

describe("presets", () => {
  it("a room without stored presets reads the code default (by rating, D1)", () => {
    expect(resolvePresets(null)).toEqual([CODE_DEFAULT_PRESET]);
    expect(CODE_DEFAULT_PRESET).toMatchObject({ problemCount: 4, durationMin: 90, mode: "rating", challenge: "balanced", rated: true, avoidSolved: true });
    expect(resolvePresets([{ broken: true }])).toEqual([CODE_DEFAULT_PRESET]);
  });

  it("the default preset is defaultPresetId when it exists, else the first", () => {
    const list = [preset(), preset({ id: "b", name: "B" })];
    expect(defaultPreset(list, "b").id).toBe("b");
    expect(defaultPreset(list, "gone").id).toBe("sat00001");
    expect(defaultPreset(list, null).id).toBe("sat00001");
  });

  it("save adds up to 5 (the 6th → 409), replaces by id, deletes, sets the default", () => {
    let list: SessionTemplate[] = [];
    let def: string | null = null;
    for (let i = 0; i < 5; i++) {
      const r = applyPresetsAction(list, def, { action: "save", preset: { ...preset(), id: undefined, name: `P${i}` } }, nextId);
      if (!r.ok) throw new Error(r.code);
      list = r.presets;
      def = r.defaultPresetId;
    }
    expect(list).toHaveLength(5);
    expect(def).toBe(list[0].id);
    const sixth = applyPresetsAction(list, def, { action: "save", preset: { ...preset(), id: undefined } }, nextId);
    expect(sixth).toMatchObject({ ok: false, status: 409, code: "too_many_presets" });

    const replaced = applyPresetsAction(list, def, { action: "save", preset: { ...preset(), id: list[2].id, name: "Renamed" } }, nextId);
    expect(replaced.ok && replaced.presets[2].name).toBe("Renamed");
    expect(applyPresetsAction(list, def, { action: "save", preset: { ...preset(), id: "nope" } }, nextId)).toMatchObject({ status: 404 });

    const made = applyPresetsAction(list, def, { action: "default", id: list[3].id }, nextId);
    expect(made.ok && made.defaultPresetId).toBe(list[3].id);
    const deleted = applyPresetsAction(list, list[3].id, { action: "delete", id: list[3].id }, nextId);
    expect(deleted.ok && deleted.presets).toHaveLength(4);
    expect(deleted.ok && deleted.defaultPresetId).toBe(list[0].id);
    expect(applyPresetsAction([list[0]], null, { action: "delete", id: list[0].id }, nextId)).toMatchObject({ code: "last_preset" });
  });

  it("templates are strict and validated (count 1–8, duration 15–240 step 5, mix only in difficulty mode)", () => {
    expect(sessionTemplateSchema.safeParse(preset()).success).toBe(true);
    expect(sessionTemplateSchema.safeParse({ ...preset(), extra: 1 }).success).toBe(false);
    expect(sessionTemplateSchema.safeParse(preset({ problemCount: 9 })).success).toBe(false);
    expect(sessionTemplateSchema.safeParse(preset({ durationMin: 92 })).success).toBe(false);
    expect(sessionTemplateSchema.safeParse(preset({ mix: { easy: 1, medium: 2, hard: 1 } })).success).toBe(false);
    expect(sessionTemplateSchema.safeParse(preset({ mode: "difficulty", mix: { easy: 1, medium: 2, hard: 1 } })).success).toBe(true);
    expect(sessionTemplateSchema.safeParse(preset({ mode: "difficulty", mix: { easy: 1, medium: 1, hard: 1 } })).success).toBe(false);
    expect(presetsBodySchema.safeParse({ action: "save", preset: { ...preset(), name: "x".repeat(31) } }).success).toBe(false);
    expect(presetsBodySchema.safeParse({ action: "rename", id: "a" }).success).toBe(false);
  });
});

describe("schedule and profile bodies", () => {
  it("weekday 0–6, HH:MM 24 h, IANA zone", () => {
    const ok = { weekday: 6, time: "18:00", timeZone: "Europe/Kyiv", presetId: null };
    expect(roomScheduleSchema.safeParse(ok).success).toBe(true);
    expect(roomScheduleSchema.safeParse({ ...ok, timeZone: "UTC" }).success).toBe(true);
    expect(roomScheduleSchema.safeParse({ ...ok, weekday: 7 }).success).toBe(false);
    expect(roomScheduleSchema.safeParse({ ...ok, time: "24:00" }).success).toBe(false);
    expect(roomScheduleSchema.safeParse({ ...ok, time: "6:00" }).success).toBe(false);
    expect(roomScheduleSchema.safeParse({ ...ok, timeZone: "Mars/Olympus" }).success).toBe(false);
    expect(roomScheduleSchema.safeParse({ ...ok, extra: true }).success).toBe(false);
  });

  it("description ≤ 200 without control characters, color 0–7, at least one profile field", () => {
    expect(roomProfileBodySchema.safeParse({ description: "Saturday friends" }).success).toBe(true);
    expect(roomProfileBodySchema.safeParse({ description: "x".repeat(201) }).success).toBe(false);
    expect(roomProfileBodySchema.safeParse({ description: "a\u0007b" }).success).toBe(false);
    expect(roomProfileBodySchema.safeParse({ color: 8 }).success).toBe(false);
    expect(roomProfileBodySchema.safeParse({}).success).toBe(false);
    expect(createRoomV2BodySchema.safeParse({ name: "Club", color: 3 }).success).toBe(true);
  });

  it("the room view never comes back without a preset and drops an invalid stored schedule", () => {
    const view = roomDefaultsView({ description: null, color: 2, presets: null, defaultPresetId: null, schedule: { weekday: 9 } });
    expect(view).toEqual({ description: null, color: 2, presets: [CODE_DEFAULT_PRESET], defaultPresetId: "default", schedule: null });
  });

  it("self-reported rating: integer 0–4000 or null", () => {
    expect(selfRatingBodySchema.safeParse({ leetcodeRating: 1850 }).success).toBe(true);
    expect(selfRatingBodySchema.safeParse({ leetcodeRating: null }).success).toBe(true);
    expect(selfRatingBodySchema.safeParse({ leetcodeRating: 4001 }).success).toBe(false);
    expect(selfRatingBodySchema.safeParse({ leetcodeRating: 1500.5 }).success).toBe(false);
    expect(selfRatingBodySchema.safeParse({}).success).toBe(false);
  });
});

describe("session settings v2", () => {
  it("a new session from the default preset is By rating and rated", () => {
    const r = resolveSettings(null, {}, NOW, CODE_DEFAULT_PRESET);
    expect(r).toMatchObject({ problemCount: 4, durationMin: 90, rated: true, settings: { mode: "rating", challenge: "balanced" } });
    expect("presetId" in (r as { settings: object }).settings).toBe(false);
    const fromSaved = resolveSettings(null, { problemCount: 2 }, NOW, preset({ mode: "difficulty", challenge: "tough" }));
    expect(fromSaved).toMatchObject({ problemCount: 2, settings: { mode: "difficulty", challenge: "tough", presetId: "sat00001" } });
  });

  it("short sessions (< 10 min per problem) are unrated by default; an explicit `rated` wins", () => {
    expect(ratedByDefault(30, 4)).toBe(false);
    expect(ratedByDefault(40, 4)).toBe(true);
    expect(resolveSettings(null, { durationMin: 30 }, NOW, CODE_DEFAULT_PRESET)).toMatchObject({ rated: false });
    expect(resolveSettings(null, { durationMin: 30, rated: true }, NOW, CODE_DEFAULT_PRESET)).toMatchObject({ rated: true });
    expect(resolveSettings(null, {}, NOW, preset({ rated: false }))).toMatchObject({ rated: false });
  });

  it("an explicit difficulty mix (the v1 lobby form) switches to the difficulty mode", () => {
    const base = resolveSettings(null, {}, NOW, CODE_DEFAULT_PRESET);
    if ("error" in base) throw new Error(base.error);
    expect(resolveSettings(base, { mix: { easy: 0, medium: 2, hard: 2 } }, NOW)).toMatchObject({ settings: { mode: "difficulty", mixMode: "manual" } });
    expect(resolveSettings(base, { mixMode: "suggested" }, NOW)).toMatchObject({ settings: { mode: "difficulty" } });
    expect(resolveSettings(base, { mode: "manual" }, NOW)).toMatchObject({ settings: { mode: "manual" } });
    // An existing session keeps its rated flag unless the body changes it.
    expect(resolveSettings({ ...base, rated: false }, { durationMin: 120 }, NOW)).toMatchObject({ rated: false });
  });

  it("settings stored before v2 (no mode) read as difficulty and stay without a mode", () => {
    const old = resolveSettings(null, {}, NOW);
    if ("error" in old) throw new Error(old.error);
    expect(selectionModeOf(old.settings)).toBe("difficulty");
    const again = resolveSettings(old, { durationMin: 60 }, NOW);
    expect("error" in again ? null : "mode" in again.settings).toBe(false);
  });

  it("bodies: mode/rated on draw and create, presetId on create only", () => {
    expect(sessionSettingsBodySchema.safeParse({ mode: "rating", rated: false }).success).toBe(true);
    expect(sessionSettingsBodySchema.safeParse({ mode: "elo" }).success).toBe(false);
    expect(sessionSettingsBodySchema.safeParse({ presetId: "default" }).success).toBe(false);
    expect(createSessionBodySchema.safeParse({ presetId: "default" }).success).toBe(true);
    expect(createSessionBodySchema.safeParse({ presetId: "../x" }).success).toBe(false);
  });
});

describe("meta.json rating", () => {
  const base = {
    number: 1,
    slug: "two-sum",
    title: "Two Sum",
    difficulty: "easy",
    tags: [],
    signature: { name: "twoSum", params: [{ name: "nums", type: "int[]" }], returns: "int" },
    compare: { mode: "exact" },
  };

  it("is optional, an integer 800–3000", () => {
    expect(metaSchema.safeParse(base).success).toBe(true);
    expect(metaSchema.safeParse({ ...base, rating: 1180 }).success).toBe(true);
    expect(metaSchema.safeParse({ ...base, rating: 799 }).success).toBe(false);
    expect(metaSchema.safeParse({ ...base, rating: 3001 }).success).toBe(false);
    expect(metaSchema.safeParse({ ...base, rating: 1200.5 }).success).toBe(false);
  });

  it("verify warns (no error) outside the difficulty band", () => {
    expect(ratingBandWarning({ slug: "a", difficulty: "easy", rating: 1420 })).toBeNull();
    expect(ratingBandWarning({ slug: "a", difficulty: "easy", rating: 1600 })).toContain("outside the usual easy band 1000–1450");
    expect(ratingBandWarning({ slug: "a", difficulty: "hard" })).toBeNull();
  });
});
