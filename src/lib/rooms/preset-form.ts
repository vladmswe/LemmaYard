// Room settings forms (docs/specs/rooms-v2.md §4, §5): preset editor and the
// weekly schedule, mapped to the request bodies of POST …/presets and
// …/schedule and validated with the same Zod schemas the server uses, so
// the messages match. Pure.
import {
  presetInputSchema,
  roomScheduleSchema,
  type PresetInput,
  type RoomSchedule,
  type SessionTemplate,
} from "./room-defaults";
import { ratedByDefault } from "./session-schemas";
import { WEEKDAY_NAMES } from "./schedule";
import {
  DEFAULT_DURATION_MIN,
  DEFAULT_PROBLEM_COUNT,
  DEFAULT_SELECTION_MODE,
  DIFFICULTIES,
  mixTotal,
  type Challenge,
  type Mix,
  type SelectionMode,
} from "./types";

export const MODE_LABEL: Record<SelectionMode, string> = {
  rating: "By rating",
  difficulty: "By difficulty",
  manual: "I'll pick them",
};

/** Short words for summaries ("90 min · 4 problems · by rating · balanced"). */
const MODE_WORD: Record<SelectionMode, string> = { rating: "by rating", difficulty: "by difficulty", manual: "picked by hand" };

export type PresetForm = {
  id?: string;
  name: string;
  problemCount: number;
  durationMin: number;
  mode: SelectionMode;
  challenge: Challenge;
  tags: string[];
  /** Difficulty mode only: "suggested" (from results) or a custom mix. */
  mixMode: "suggested" | "manual";
  mix: Mix;
  avoidSolved: boolean;
  rated: boolean;
  /** LeetCode slots to fill in the lobby (rooms-external-problems §4). */
  external: number;
};

export type FieldErrors = Partial<Record<string, string>>;

export function emptyPresetForm(): PresetForm {
  return {
    name: "",
    problemCount: DEFAULT_PROBLEM_COUNT,
    durationMin: DEFAULT_DURATION_MIN,
    mode: DEFAULT_SELECTION_MODE,
    challenge: "balanced",
    tags: [],
    mixMode: "suggested",
    mix: { easy: 1, medium: 2, hard: 1 },
    avoidSolved: true,
    rated: true,
    external: 0,
  };
}

export function presetToForm(p: SessionTemplate): PresetForm {
  return {
    id: p.id,
    name: p.name,
    problemCount: p.problemCount,
    durationMin: p.durationMin,
    mode: p.mode,
    challenge: p.challenge,
    tags: [...p.tags],
    mixMode: p.mix ? "manual" : "suggested",
    mix: p.mix ? { ...p.mix } : { easy: 1, medium: 2, hard: 1 },
    avoidSolved: p.avoidSolved,
    rated: p.rated,
    external: p.external ?? 0,
  };
}

/** The `preset` of `{action: "save", preset}`: a custom mix only in difficulty mode. */
export function formToPresetInput(f: PresetForm): PresetInput {
  return {
    ...(f.id ? { id: f.id } : {}),
    name: f.name.trim(),
    problemCount: f.problemCount,
    durationMin: f.durationMin,
    mode: f.mode,
    challenge: f.challenge,
    tags: [...f.tags].sort(),
    ...(f.mode === "difficulty" && f.mixMode === "manual" ? { mix: { ...f.mix } } : {}),
    avoidSolved: f.avoidSolved,
    rated: f.rated,
    ...(f.external > 0 ? { external: f.external } : {}),
  };
}

/** Zod issues → `{field: message}` (first message per top-level field). */
export function issuesToFieldErrors(issues: readonly { path: readonly PropertyKey[]; message: string }[]): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of issues) {
    const key = String(issue.path[0] ?? "form");
    if (out[key] === undefined) out[key] = issue.message;
  }
  return out;
}

export function validatePresetForm(f: PresetForm): { ok: true; preset: PresetInput } | { ok: false; fieldErrors: FieldErrors } {
  const input = formToPresetInput(f);
  const parsed = presetInputSchema.safeParse(input);
  const errors: FieldErrors = parsed.success ? {} : issuesToFieldErrors(parsed.error.issues);
  const drawn = input.problemCount - (input.external ?? 0);
  if ((input.external ?? 0) > input.problemCount && errors.external === undefined) {
    errors.external = `Use at most ${input.problemCount} LeetCode problems`;
  }
  if (input.mix && mixTotal(input.mix) !== drawn && errors.mix === undefined) {
    errors.mix = `The custom mix must add up to ${drawn}`;
  }
  if (Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return { ok: true, preset: parsed.success ? parsed.data : input };
}

/** "90 min · 4 problems · by rating · balanced" */
export function presetSummary(
  p: Pick<SessionTemplate, "durationMin" | "problemCount" | "mode" | "challenge" | "mix" | "external">,
): string {
  const parts = [`${p.durationMin} min`, `${p.problemCount} problem${p.problemCount === 1 ? "" : "s"}`];
  if (p.external) parts.push(`${p.external} from LeetCode`);
  parts.push(MODE_WORD[p.mode]);
  if (p.mode === "difficulty" && p.mix) {
    parts.push(DIFFICULTIES.filter((d) => p.mix![d] > 0).map((d) => `${p.mix![d]} ${d}`).join(" + "));
  } else if (p.mode !== "manual") {
    parts.push(p.challenge);
  }
  return parts.join(" · ");
}

/** Help under the Rated switch of a preset or lobby. */
export function ratedHelp(durationMin: number, problemCount: number): string {
  return ratedByDefault(durationMin, problemCount)
    ? "Results update ratings. Turn off for warm-ups or very short sessions."
    : "Results update ratings. Very short sessions (under 10 minutes per problem) start unrated; turn it on if you want them to count.";
}

/** "about 22 min per problem" (§2.3; duration / N, rounded). */
export function minutesPerProblem(durationMin: number, problemCount: number): string {
  return `about ${Math.round(durationMin / Math.max(1, problemCount))} min per problem`;
}

// --- Weekly schedule -------------------------------------------------------

export type ScheduleForm = {
  enabled: boolean;
  weekday: number;
  /** "HH:MM" from `<input type="time">`. */
  time: string;
  timeZone: string;
  /** "" = the room's default preset. */
  presetId: string;
};

export function scheduleToForm(s: RoomSchedule | null, fallbackZone: string): ScheduleForm {
  if (!s) return { enabled: false, weekday: 6, time: "18:00", timeZone: fallbackZone, presetId: "" };
  return { enabled: true, weekday: s.weekday, time: s.time, timeZone: s.timeZone, presetId: s.presetId ?? "" };
}

/** Body of POST …/schedule; `{schedule: null}` when the switch is off. */
export function validateScheduleForm(
  f: ScheduleForm,
): { ok: true; body: { schedule: RoomSchedule | null } } | { ok: false; fieldErrors: FieldErrors } {
  if (!f.enabled) return { ok: true, body: { schedule: null } };
  const parsed = roomScheduleSchema.safeParse({
    weekday: f.weekday,
    time: f.time,
    timeZone: f.timeZone,
    presetId: f.presetId === "" ? null : f.presetId,
  });
  if (!parsed.success) return { ok: false, fieldErrors: issuesToFieldErrors(parsed.error.issues) };
  return { ok: true, body: { schedule: parsed.data } };
}

export function sameSchedule(a: RoomSchedule | null, b: RoomSchedule | null): boolean {
  if (a === null || b === null) return a === b;
  return a.weekday === b.weekday && a.time === b.time && a.timeZone === b.timeZone && (a.presetId ?? null) === (b.presetId ?? null);
}

export const WEEKDAY_OPTIONS = WEEKDAY_NAMES.map((name, value) => ({ value, label: name }));

// --- Lobby ↔ presets (§2.3 preset tiles, "+ Save current as preset") -------

/** The lobby fields a preset fixes (planned date and pins are per session). */
export type LobbyPresetFields = {
  problemCount: number;
  durationMin: number;
  mode: SelectionMode;
  challenge: Challenge;
  tags: string[];
  mixMode: "suggested" | "manual";
  mix: Mix;
  avoidSolved: boolean;
  rated: boolean;
  external: number;
};

const sortedEqual = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");

/** True when the lobby form shows exactly this preset (its tile is selected; otherwise "Custom"). */
export function lobbyMatchesPreset(form: LobbyPresetFields, p: SessionTemplate): boolean {
  if (
    form.problemCount !== p.problemCount ||
    form.durationMin !== p.durationMin ||
    form.mode !== p.mode ||
    form.avoidSolved !== p.avoidSolved ||
    form.rated !== p.rated ||
    form.external !== (p.external ?? 0) ||
    !sortedEqual(form.tags, p.tags)
  ) {
    return false;
  }
  if (p.mode !== "manual" && form.challenge !== p.challenge) return false;
  if (p.mode === "difficulty") {
    const custom = form.mixMode === "manual";
    if (custom !== Boolean(p.mix)) return false;
    if (p.mix && DIFFICULTIES.some((d) => form.mix[d] !== p.mix![d])) return false;
  }
  return true;
}

/** The lobby form after choosing a preset tile (keeps fields a preset does not set). */
export function applyPresetToLobby<T extends LobbyPresetFields>(form: T, p: SessionTemplate): T {
  return {
    ...form,
    problemCount: p.problemCount,
    durationMin: p.durationMin,
    mode: p.mode,
    challenge: p.challenge,
    tags: [...p.tags],
    mixMode: p.mode === "difficulty" && p.mix ? "manual" : "suggested",
    mix: p.mix ? { ...p.mix } : form.mix,
    avoidSolved: p.avoidSolved,
    rated: p.rated,
    external: p.external ?? 0,
  };
}

/** The preset form for "+ Save current as preset". */
export function presetFormFromLobby(form: LobbyPresetFields, name = ""): PresetForm {
  return {
    name,
    problemCount: form.problemCount,
    durationMin: form.durationMin,
    mode: form.mode,
    challenge: form.challenge,
    tags: [...form.tags],
    mixMode: form.mode === "difficulty" ? form.mixMode : "suggested",
    mix: { ...form.mix },
    avoidSolved: form.avoidSolved,
    rated: form.rated,
    external: form.external,
  };
}
