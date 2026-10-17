// Session countdown on the client (docs/specs/rooms.md §3.4 "Times", §7.4
// Countdown). The server is the time authority: every state response carries
// `serverNow`, the client keeps the offset `server − client` and computes the
// time left from `endsAt`, never from the local clock alone. Pure module.
import { formatScoreTime } from "./scoring";

/** Offset changes smaller than this are ignored so the timer never jitters. */
export const OFFSET_JITTER_MS = 1000;

/** Milestones announced politely (spec §7.4 accessibility; §3.5 copy table). */
export const COUNTDOWN_MILESTONES_MS = [10 * 60_000, 60_000] as const;

/** Below this the countdown uses the warning tone plus the word "left". */
export const FINAL_MINUTES_MS = 10 * 60_000;

/** `server − client` in ms from one response, received at `clientNowMs`. */
export function clockOffset(serverNowIso: string, clientNowMs: number): number {
  const server = Date.parse(serverNowIso);
  return Number.isFinite(server) ? server - clientNowMs : 0;
}

/** Keeps the previous offset unless the new sample differs by more than the jitter. */
export function nextOffset(previous: number | null, sample: number): number {
  if (previous === null) return sample;
  return Math.abs(sample - previous) > OFFSET_JITTER_MS ? sample : previous;
}

/** Milliseconds left until `endsAt` on the server clock (never negative); null without an end. */
export function remainingMs(endsAtIso: string | null, offsetMs: number, clientNowMs: number): number | null {
  if (!endsAtIso) return null;
  const end = Date.parse(endsAtIso);
  if (!Number.isFinite(end)) return null;
  return Math.max(0, end - (clientNowMs + offsetMs));
}

/** Whole seconds shown for a remaining time: rounds up, so "0:00" means over. */
export function remainingSeconds(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}

/** "47:12" under an hour, "1:02:03" otherwise (same format as the scoreboard, §4.3). */
export function formatCountdown(ms: number): string {
  return formatScoreTime(remainingSeconds(ms));
}

function unit(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "1 hour 2 minutes 5 seconds", "47 minutes 12 seconds", "0 seconds". */
export function durationWords(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts: string[] = [];
  if (h > 0) parts.push(unit(h, "hour"));
  if (m > 0) parts.push(unit(m, "minute"));
  if (sec > 0 || parts.length === 0) parts.push(unit(sec, "second"));
  return parts.join(" ");
}

/** `aria-label` of the timer: "Time left: 47 minutes 12 seconds". */
export function countdownLabel(ms: number): string {
  return `Time left: ${durationWords(remainingSeconds(ms))}`;
}

/**
 * Milestones crossed between two readings (prev > m ≥ next). The first
 * reading (prev null) announces nothing, so opening the page at 8 minutes
 * left does not claim "10 minutes left".
 */
export function crossedMilestones(
  prevMs: number | null,
  nextMs: number,
  milestones: readonly number[] = COUNTDOWN_MILESTONES_MS,
): number[] {
  if (prevMs === null) return [];
  return milestones.filter((m) => prevMs > m && nextMs <= m && nextMs > 0);
}

/** "10 minutes left" / "1 minute left". */
export function milestoneMessage(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  return `${unit(minutes, "minute")} left`;
}

export function isFinalMinutes(ms: number | null): boolean {
  return ms !== null && ms < FINAL_MINUTES_MS;
}
