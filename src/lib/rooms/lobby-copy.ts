// Plain-words copy of the lobby (docs/specs/rooms.md §2.3, §2.4, §2.6): the
// calibration panel, slot notes and the settings diff sent to /draw. Pure.
import { PRIOR_RATES, PRIOR_WEIGHT } from "./selection";
import type { CalibrationView, LobbySlotView, LobbyView } from "./session-view";
import { mixLabel } from "./session-view";
import type { SessionSettingsBody } from "./session-schemas";
import {
  DIFFICULTIES,
  externalCountOf,
  leetcodeAutoOf,
  mixTotal,
  selectionModeOf,
  type Challenge,
  type Difficulty,
  type Mix,
  type SelectionMode,
} from "./types";

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

export const CHALLENGE_COPY: Record<Challenge, { label: string; target: string; help: string }> = {
  relaxed: { label: "Relaxed", target: "about two thirds", help: "Most people solve about two thirds of the problems." },
  balanced: { label: "Balanced", target: "about half", help: "Most people solve about half of the problems." },
  tough: { label: "Tough", target: "about a third", help: "Most people solve about a third of the problems." },
};

/** Duration presets of the Select (§7.4); any other valid value is kept as "custom". */
export const DURATION_PRESETS = [30, 45, 60, 75, 90, 120, 150, 180] as const;

export function durationLabel(min: number): string {
  if (min < 60 || min % 60 !== 0) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${min} min (${h} h ${m} min)` : `${min} min`;
  }
  return `${min} min (${min / 60} h)`;
}

export function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export type CalibrationCopy = {
  suggested: string | null;
  basis: string;
  expected: string | null;
  /** How the rates are computed, in plain words. */
  explainer: string;
  rates: { difficulty: Difficulty; label: string; solved: number; pairs: number; rate: string }[];
};

function sessionsWord(n: number) {
  return `${n} session${n === 1 ? "" : "s"}`;
}

/** Copy of the calibration panel (§2.3 "The host sees"). */
export function calibrationCopy(cal: CalibrationView, problemCount: number, challenge: Challenge): CalibrationCopy {
  const basis =
    cal.sessions === 0
      ? "No finished sessions yet, so we start with a standard mix. It adapts after your first session."
      : `Based on your last ${sessionsWord(cal.sessions)} (people who submitted): ` +
        DIFFICULTIES.map((d, i) => {
          const c = cal.counts[d];
          return `${DIFFICULTY_LABEL[d]} ${c.solved} of ${c.pairs}${i === 0 ? " solved" : ""}`;
        }).join(", ") +
        ".";
  const expected =
    cal.expectedSolved === null
      ? null
      : `Expected: about ${cal.expectedSolved.toFixed(1)} of ${problemCount} solved per person ` +
        `(target: ${CHALLENGE_COPY[challenge].label}, ${CHALLENGE_COPY[challenge].target}).`;
  const priors = DIFFICULTIES.map((d) => `${DIFFICULTY_LABEL[d]} ${percent(PRIOR_RATES[d])}`).join(", ");
  return {
    suggested: cal.suggested ? `Suggested: ${mixLabel(cal.suggested)}` : null,
    basis,
    expected,
    explainer:
      `Each rate is the share of problems of that difficulty that people who submitted actually solved, ` +
      `blended with a starting guess (${priors}) worth ${PRIOR_WEIGHT} attempts, so one evening does not swing the mix. ` +
      `We then pick the mix whose expected share is closest to your challenge level.`,
    rates: DIFFICULTIES.map((d) => ({
      difficulty: d,
      label: DIFFICULTY_LABEL[d],
      solved: cal.counts[d].solved,
      pairs: cal.counts[d].pairs,
      rate: percent(cal.rates[d]),
    })),
  };
}

/** "Unused in this room: 7 easy, 2 medium, 0 hard" (§2.4). */
export function unusedLine(unused: Mix): string {
  return `Unused in this room: ${DIFFICULTIES.map((d) => `${unused[d]} ${d}`).join(", ")}`;
}

/** "Available: 6 Easy · 4 Medium · 1 Hard". */
export function availableLine(available: Mix): string {
  return `Available: ${mixLabel(available)}`;
}

/**
 * Muted note of a slot drawn from tier B or C (§2.4): "2 of 3 people have
 * solved this before" / "Used in this room on Oct 3". Tier A has none.
 */
export function slotNote(note: LobbySlotView["note"], formatDate: (iso: string) => string): string | null {
  if (!note) return null;
  if (note.tier === "C" && note.lastUsedAt) return `Used in this room on ${formatDate(note.lastUsedAt)}`;
  if (note.tier === "B" && note.solvedBy) {
    const n = note.solvedBy;
    const who = note.expectedCount === 1 ? "person" : "people";
    return `${n} of ${note.expectedCount} ${who} ${n === 1 ? "has" : "have"} solved this before`;
  }
  return null;
}

export function formatShortDate(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(timeZone ? { timeZone } : {}) });
}

/** Lobby slot line for everyone: "Problem 2 · Medium · Dynamic programming". */
export function slotSummary(
  slot: Pick<LobbySlotView, "position" | "difficulty" | "tags" | "external">,
  tagName: (slug: string) => string,
) {
  const parts = [`Problem ${slot.position}`];
  if (slot.external) parts.push("LeetCode");
  if (slot.difficulty) parts.push(DIFFICULTY_LABEL[slot.difficulty]);
  if (slot.tags.length > 0) parts.push(slot.tags.map(tagName).join(", "));
  return parts.join(" · ");
}

/** "dynamic-programming" → "Dynamic programming" (fallback when a tag name is unknown). */
export function humanizeTag(slug: string): string {
  const words = slug.split("-").join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export type LobbyForm = {
  problemCount: number;
  durationMin: number;
  tags: string[];
  mixMode: "suggested" | "manual";
  mix: Mix;
  challenge: Challenge;
  avoidSolved: boolean;
  /** `datetime-local` value or "" (none). */
  plannedFor: string;
  /** v2: how problems are picked. */
  mode: SelectionMode;
  /** v2: the results change ratings. */
  rated: boolean;
  /** LeetCode slots at the end (stepper and preset tiles; the slot list also adds and removes them). */
  external: number;
  /** Auto-pick the LeetCode slots from the catalog. */
  leetcodeAuto: boolean;
};

/** `datetime-local` value in the viewer's zone for an ISO time ("" for none). */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formFromLobby(lobby: LobbyView): LobbyForm {
  return {
    problemCount: lobby.problemCount,
    durationMin: lobby.durationMin,
    tags: [...lobby.settings.tags],
    mixMode: lobby.settings.mixMode,
    mix: { ...lobby.settings.mix },
    challenge: lobby.settings.challenge,
    avoidSolved: lobby.settings.avoidSolved,
    plannedFor: toLocalInput(lobby.plannedFor),
    mode: lobby.mode ?? selectionModeOf(lobby.settings),
    rated: lobby.rated ?? true,
    external: externalCountOf(lobby.settings),
    leetcodeAuto: leetcodeAutoOf(lobby.settings),
  };
}

const sameTags = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().every((t, i) => t === [...b].sort()[i]);
const sameMix = (a: Mix, b: Mix) => DIFFICULTIES.every((d) => a[d] === b[d]);

/**
 * Body for POST /draw with only the fields that changed. A custom mix is sent
 * with `mixMode: "manual"`; switching back to suggested sends only the mode.
 */
export function settingsDiff(lobby: LobbyView, form: LobbyForm): SessionSettingsBody {
  const before = formFromLobby(lobby);
  const body: SessionSettingsBody = {};
  if (form.problemCount !== before.problemCount) body.problemCount = form.problemCount;
  if (form.durationMin !== before.durationMin) body.durationMin = form.durationMin;
  if (!sameTags(form.tags, before.tags)) body.tags = [...form.tags].sort();
  if (form.challenge !== before.challenge) body.challenge = form.challenge;
  if (form.avoidSolved !== before.avoidSolved) body.avoidSolved = form.avoidSolved;
  if (form.external !== before.external) body.external = form.external;
  if (form.leetcodeAuto !== before.leetcodeAuto) body.leetcodeAuto = form.leetcodeAuto;
  const countChanged = body.problemCount !== undefined || body.external !== undefined;
  if (form.mode === "difficulty") {
    if (form.mixMode !== before.mixMode) body.mixMode = form.mixMode;
    if (form.mixMode === "manual" && (form.mixMode !== before.mixMode || !sameMix(form.mix, before.mix) || countChanged)) {
      body.mixMode = "manual";
      body.mix = { ...form.mix };
    }
    if (form.mode !== before.mode) body.mode = "difficulty";
  } else {
    // Rating / manual mode ignore the mix, but a stored custom mix would still
    // have to add up to a new count: drop it back to "suggested".
    if (before.mixMode === "manual" && (form.mode !== before.mode || countChanged)) body.mixMode = "suggested";
    // A mix field without a mode reads as the difficulty mode on the server.
    if (form.mode !== before.mode || body.mixMode !== undefined) body.mode = form.mode;
  }
  if (form.rated !== before.rated) body.rated = form.rated;
  if (form.plannedFor !== before.plannedFor) {
    body.plannedFor = form.plannedFor ? new Date(form.plannedFor).toISOString() : null;
  }
  return body;
}

/** Client-side check of a custom mix before sending (the server enforces the same rule). */
export function mixError(form: LobbyForm): string | null {
  if (form.external > form.problemCount) {
    return `This session has ${form.external} LeetCode problem${form.external === 1 ? "" : "s"}; choose at least ${form.external} problems`;
  }
  if (form.mixMode !== "manual") return null;
  const total = mixTotal(form.mix);
  // LeetCode slots are not drawn: the mix covers the rest.
  const drawn = form.problemCount - form.external;
  if (total !== drawn) {
    const extra = form.external > 0 ? ` (${form.external} more from LeetCode)` : "";
    return `The custom mix adds up to ${total}; it must add up to ${drawn} problem${drawn === 1 ? "" : "s"}${extra}`;
  }
  return null;
}
