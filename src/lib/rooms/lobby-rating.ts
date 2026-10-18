// View model of the rating-based lobby (docs/specs/rooms-v2.md §2.3, §6.3,
// §12): mode and challenge copy, the problem cards' rating lines, the
// expectation panel and the "How are problems picked by rating?"
// explainer. Pure; the lobby components only render these strings.
import { RATING_CHALLENGE_TARGETS, solveProbability } from "./rating";
import { CHALLENGE_TARGETS } from "./selection";
import type { LobbyExpectationView, LobbySlotRatingView, LobbyView } from "./session-view";
import { CHALLENGES, selectionModeOf, type Challenge, type SelectionMode } from "./types";

export const MODE_OPTIONS: readonly { value: SelectionMode; label: string }[] = [
  { value: "rating", label: "By rating" },
  { value: "difficulty", label: "By difficulty" },
  { value: "manual", label: "I'll pick them" },
];

export const MODE_HELP: Record<SelectionMode, string> = {
  rating: "Problems are chosen so the people in this lobby solve about the share you pick, from their ratings in this room.",
  difficulty: "An Easy / Medium / Hard mix based on how this room did in its last sessions, or your own mix.",
  manual: "You pick every problem with Pin. Start works once every slot is filled.",
};

const CHALLENGE_NAME: Record<Challenge, string> = { relaxed: "Relaxed", balanced: "Balanced", tough: "Tough" };

/** The target share of a challenge in a mode (rating 75/55/35, difficulty 65/50/35). */
export function challengeTarget(mode: SelectionMode, c: Challenge): number {
  return mode === "rating" ? RATING_CHALLENGE_TARGETS[c] : CHALLENGE_TARGETS[c];
}

export function pct(x: number): number {
  return Math.round(x * 100);
}

export function challengeOptions(mode: SelectionMode): { value: Challenge; name: string; percent: string }[] {
  return CHALLENGES.map((c) => ({ value: c, name: CHALLENGE_NAME[c], percent: `${pct(challengeTarget(mode, c))}%` }));
}

/** "Most people should solve about 55% of the problems: about 2.2 of 4." */
export function challengeHelp(mode: SelectionMode, c: Challenge, problemCount: number): string {
  const t = challengeTarget(mode, c);
  const each = (t * problemCount).toFixed(1);
  return `Each person should solve about ${pct(t)}% of the problems: about ${each} of ${problemCount}.`;
}

/** "−7" / "+13" / "±0" with a real minus sign. */
export function signed(n: number): string {
  if (n === 0) return "±0";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

export type SlotRatingLines = {
  chancePercent: number;
  /** "~62% of this room should solve it" */
  chance: string;
  /** Host only: "rating 1500" */
  rating?: string;
  /** Host only: "target 1507 (−7)"; pinned: "pinned, no target" */
  target?: string;
};

export function slotRatingLines(r: LobbySlotRatingView | undefined): SlotRatingLines | null {
  if (!r) return null;
  const chancePercent = pct(r.chance);
  const out: SlotRatingLines = { chancePercent, chance: `~${chancePercent}% of this room should solve it` };
  if (r.rating !== undefined) out.rating = `rating ${r.rating}`;
  if (r.target !== undefined) {
    out.target =
      r.target === null ? "pinned, no target" : `target ${r.target} (${signed(r.deviation ?? (r.rating ?? r.target) - r.target)})`;
  }
  return out;
}

export type ExpectationCopy = {
  /** "Expected: about 2.2 of 4 solved per person" */
  headline: string;
  /** "(54%; target Balanced 55%)" */
  detail: string;
  /** "The room rating range is 1380–1620." / "Ratings here span 1250–1900, so the problems span wider." */
  range: string | null;
  /** "dan's rating is provisional (first sessions move it faster)." */
  provisional: string | null;
  /** Shown when the realized share is more than 8 points off the target. */
  coarse: string | null;
  people: { userId: string; username: string; rating: string; expected: string; provisional: boolean }[];
};

export function ratingLabel(rating: number, provisional: boolean): string {
  return `${rating}${provisional ? "?" : ""}`;
}

function nameList(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function expectationCopy(e: LobbyExpectationView, problemCount: number, challenge: Challenge): ExpectationCopy {
  const range = e.ratingRange
    ? e.widened
      ? `Ratings here span ${e.ratingRange.min}–${e.ratingRange.max}, so the problems span wider.`
      : e.ratingRange.min === e.ratingRange.max
        ? `Everyone here is rated ${e.ratingRange.min}.`
        : `The room rating range is ${e.ratingRange.min}–${e.ratingRange.max}.`
    : null;
  const prov = e.perUser.filter((u) => u.provisional).map((u) => u.username);
  return {
    headline: `Expected: about ${e.expectedPerPerson.toFixed(1)} of ${problemCount} solved per person`,
    detail: `(${pct(e.share)}%; target ${CHALLENGE_NAME[challenge]} ${pct(e.target)}%)`,
    range,
    provisional:
      prov.length === 0
        ? null
        : `${nameList(prov)}${prov.length === 1 ? "'s rating is" : "'s ratings are"} provisional (the first sessions move it faster).`,
    coarse: Math.abs(e.share - e.target) > 0.08 ? "The catalog has few problems near these targets." : null,
    people: e.perUser.map((u) => ({
      userId: u.userId,
      username: u.username,
      rating: ratingLabel(u.rating, u.provisional),
      expected: `${u.expected.toFixed(1)} of ${problemCount}`,
      provisional: u.provisional,
    })),
  };
}

/** A member's room rating for display (D3: every member sees it); null hides it. */
export function memberRatingLabel(r: { rating: number | null; provisional: boolean } | null | undefined): string | null {
  if (!r || r.rating === null) return null;
  return ratingLabel(r.rating, r.provisional);
}

export type RatingExplainer = {
  formula: string;
  example: string;
  ladder: string;
  /** Host only: "Targets here: 1307 · 1407 · 1507 · 1607." */
  targets: string | null;
  how: string;
  privacy: string;
};

/** Ladder offsets in words for N problems (§6.3): "−150, −50, +50, +150". */
function ladderWords(n: number): string {
  if (n <= 1) return "one problem, at the center";
  const w = Math.min(400, 100 * (n - 1));
  return Array.from({ length: n }, (_, i) => signed(Math.round(w * (i / (n - 1) - 0.5)))).join(", ");
}

/**
 * "How are problems picked by rating?" (§6.1–§6.3). The example numbers
 * come from the same formula: 1500 vs 1500 → 50%, vs 1700 → 24%, vs 1300 → 76%.
 */
export function ratingExplainer(lobby: Pick<LobbyView, "problemCount" | "settings" | "expected">): RatingExplainer {
  const n = lobby.problemCount;
  const tau = pct(RATING_CHALLENGE_TARGETS[lobby.settings.challenge]);
  const p = (rp: number) => pct(solveProbability(1500, rp));
  const targets = (lobby.settings.targets ?? []).filter((t): t is number => t !== null);
  return {
    formula: "chance to solve = 1 / (1 + 10^((problem rating − your rating) / 400))",
    example:
      `Every person has a rating in this room, and every problem has one too. Someone rated 1500 solves a 1500 problem ` +
      `about ${p(1500)}% of the time, a 1700 problem about ${p(1700)}%, and a 1300 problem about ${p(1300)}%.`,
    ladder:
      `For ${n} problem${n === 1 ? "" : "s"} the targets are a ladder around a center (${ladderWords(n)}), warm-up first. ` +
      `The center is set so the average chance over everyone in this lobby is ${tau}%. ` +
      `Wide rating gaps widen the ladder.`,
    targets: lobby.expected && targets.length > 0 ? `Targets here: ${[...targets].sort((a, b) => a - b).join(" · ")}.` : null,
    how:
      "For each slot we take an unused problem within 100 of its target (then 200, 300), preferring problems nobody here has solved. " +
      "After a rated session, solving more than expected raises your rating; solving fewer lowers it.",
    privacy: "Ratings come from this room's sessions only. We don't use LeetCode data.",
  };
}

/** The lobby's selection mode (pre-v2 sessions read "difficulty"). */
export function lobbyMode(lobby: Pick<LobbyView, "mode" | "settings">): SelectionMode {
  return lobby.mode ?? selectionModeOf(lobby.settings);
}

/** Positions 1..N without a slot (manual mode: "Pick a problem"). */
export function emptyPositions(lobby: Pick<LobbyView, "problemCount" | "slots">): number[] {
  const taken = new Set(lobby.slots.map((s) => s.position));
  return Array.from({ length: lobby.problemCount }, (_, i) => i + 1).filter((p) => !taken.has(p));
}

/** Why Start is disabled, in plain words (null = it can start, as far as slots go). */
export function startBlockedReason(lobby: Pick<LobbyView, "problemCount" | "slots" | "mode" | "settings">): string | null {
  const empty = emptyPositions(lobby);
  // LeetCode slots are the last `external` positions (rooms-external-problems §1.2).
  const drawn = lobby.problemCount - (lobby.settings.external ?? 0);
  const missingExternal = empty.filter((p) => p > drawn).length;
  const missing = empty.length - missingExternal;
  if (missingExternal > 0 && missing === 0) {
    return `Pick ${missingExternal} LeetCode problem${missingExternal === 1 ? "" : "s"} to start.`;
  }
  if (missing > 0) {
    return lobbyMode(lobby) === "manual"
      ? `Pick ${missing} more problem${missing === 1 ? "" : "s"} with Pin to start.`
      : "Fill every problem slot to start.";
  }
  if (lobby.slots.some((s) => s.problem?.published === false)) return "Re-roll the problem that is no longer available.";
  return null;
}
