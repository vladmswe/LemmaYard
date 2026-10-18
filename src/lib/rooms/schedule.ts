// Weekly schedule math (docs/specs/rooms-v2.md §5, AC-V2-DEF-2). Pure module:
// the room page, the rooms list, the .ics route and the settings form share
// it. Wall-clock math goes through `Intl.DateTimeFormat`, so time zones and
// DST changes follow the runtime's tz database; offsets are never stored.
import type { RoomSchedule } from "./room-defaults";

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** RFC 5545 BYDAY codes, index = weekday (0 = Sunday). */
export const ICS_WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

export type WallTime = { year: number; month: number; day: number; hour: number; minute: number; second: number; weekday: number };

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      weekday: "short",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The wall clock of instant `t` in `timeZone`. */
export function wallTime(t: number | Date, timeZone: string): WallTime {
  const parts = wallFormatter(timeZone).formatToParts(new Date(t));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "0";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: WEEKDAY_SHORT.indexOf(get("weekday") as (typeof WEEKDAY_SHORT)[number]),
  };
}

/** UTC offset of `timeZone` at instant `t`, in minutes (Kyiv in summer: +180). */
export function zoneOffsetMinutes(t: number | Date, timeZone: string): number {
  const ms = new Date(t).getTime();
  const w = wallTime(ms, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / MINUTE_MS);
}

/**
 * The instant at which the wall clock in `timeZone` shows the given local
 * time. A time skipped by a DST change (e.g. 03:30 on the spring-forward
 * night) resolves to the instant just after the gap (04:30 new time); a
 * repeated time (fall back) resolves to one real instance of it.
 */
export function zonedTimeToUtc(
  local: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): Date {
  const guess = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
  const first = guess - zoneOffsetMinutes(guess, timeZone) * MINUTE_MS;
  const second = guess - zoneOffsetMinutes(first, timeZone) * MINUTE_MS;
  if (first === second) return new Date(first);
  // Two candidates: an ambiguous (fall back) or a skipped (spring forward) time.
  const earlier = Math.min(first, second);
  const later = Math.max(first, second);
  const show = (t: number) => {
    const w = wallTime(t, timeZone);
    return w.hour === local.hour && w.minute === local.minute;
  };
  if (show(earlier)) return new Date(earlier);
  if (show(later)) return new Date(later);
  return new Date(later);
}

function parseTime(time: string): { hour: number; minute: number } {
  const [h, m] = time.split(":").map(Number);
  return { hour: h, minute: m };
}

/**
 * The next weekly occurrence at or after `now` (AC-V2-DEF-2). An occurrence
 * whose minute has started still counts until that minute ends ("now equal
 * to the occurrence minute → that occurrence"). Occurrences listed in
 * `taken` (the `planned_for` of the room's finished sessions) are skipped, so
 * after this week's session the card moves on to next week.
 */
export function nextOccurrence(
  schedule: Pick<RoomSchedule, "weekday" | "time" | "timeZone">,
  now: Date,
  taken: readonly (Date | string)[] = [],
): Date {
  const { hour, minute } = parseTime(schedule.time);
  const skip = new Set(taken.map((t) => new Date(t).getTime()));
  const today = wallTime(now, schedule.timeZone);
  const base = Date.UTC(today.year, today.month - 1, today.day);
  // Start one day back: near midnight the zone's "today" may already be tomorrow in UTC terms.
  for (let k = -1; k <= 7 * 6; k++) {
    const day = new Date(base + k * DAY_MS);
    if (day.getUTCDay() !== schedule.weekday) continue;
    const at = zonedTimeToUtc(
      { year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(), hour, minute },
      schedule.timeZone,
    );
    if (at.getTime() + MINUTE_MS <= now.getTime()) continue;
    if (skip.has(at.getTime())) continue;
    return at;
  }
  // Unreachable unless every week for six weeks is taken.
  throw new Error("nextOccurrence: no free occurrence in six weeks");
}

/** "Sat, Oct 24 · 18:00" in the schedule's zone. */
export function formatOccurrence(at: Date | string, timeZone: string): string {
  const d = new Date(at);
  const date = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone });
  return `${date} · ${time}`;
}

/**
 * "now" / "in 25 min" / "in 3 hours" (same day) / "tomorrow" / "in 2 days",
 * counted in calendar days of `timeZone`.
 */
export function relativeWhen(at: Date | string, now: Date, timeZone: string): string {
  const t = new Date(at).getTime();
  const diffMin = Math.round((t - now.getTime()) / MINUTE_MS);
  if (diffMin <= 0) return "now";
  const a = wallTime(t, timeZone);
  const b = wallTime(now, timeZone);
  const days = Math.round((Date.UTC(a.year, a.month - 1, a.day) - Date.UTC(b.year, b.month - 1, b.day)) / DAY_MS);
  if (days <= 0) {
    if (diffMin < 60) return `in ${diffMin} min`;
    const hours = Math.round(diffMin / 60);
    return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/** "every Saturday" */
export function scheduleCadence(schedule: Pick<RoomSchedule, "weekday">): string {
  return `every ${WEEKDAY_NAMES[schedule.weekday]}`;
}

/** "Saturdays at 18:00 (Europe/Kyiv)" */
export function scheduleSummary(schedule: Pick<RoomSchedule, "weekday" | "time" | "timeZone">): string {
  return `${WEEKDAY_NAMES[schedule.weekday]}s at ${schedule.time} (${schedule.timeZone})`;
}

/** The viewer's IANA zone (browser), or UTC when the runtime does not say. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Zone names for the settings select; the given zone is always included. */
export function timeZoneOptions(include: readonly string[] = []): string[] {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    zones = [];
  }
  const all = new Set([...zones, "UTC", ...include.filter(Boolean)]);
  return [...all].sort();
}
