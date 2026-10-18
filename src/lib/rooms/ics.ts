// "Add to calendar" file of a room's weekly schedule (docs/specs/rooms-v2.md
// §5, §14, AC-V2-DEF-4): one VEVENT with a weekly RRULE in the schedule's
// zone, a VTIMEZONE built from the runtime's tz data (RFC 5545 §3.6.5 wants
// one per TZID), CRLF line ends and 75-octet folding. It carries the room
// name and the room URL only: no invite token, no member names. Pure.
import type { RoomSchedule } from "./room-defaults";
import { ICS_WEEKDAYS, wallTime, zoneOffsetMinutes } from "./schedule";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;
/** VTIMEZONE covers the zone's transitions this long after the first occurrence. */
const TZ_SPAN_DAYS = 3 * 366;

export const ICS_DESCRIPTION = "LemmaYard room session";

/** RFC 5545 §3.3.11 TEXT escaping. */
export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds one content line to ≤ 75 octets per physical line (§3.1), never inside a UTF-8 sequence. */
export function foldIcsLine(line: string): string {
  const enc = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with one space
    if (bytes + n > limit) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += n;
  }
  out.push(current);
  return out.join("\r\n ");
}

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** 20261024T180000 (local, no zone suffix). */
function localStamp(w: { year: number; month: number; day: number; hour: number; minute: number; second?: number }): string {
  return `${w.year}${pad(w.month)}${pad(w.day)}T${pad(w.hour)}${pad(w.minute)}${pad(w.second ?? 0)}`;
}

/** 20261018T120000Z */
export function utcStamp(t: Date): string {
  return (
    `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}` +
    `T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}${pad(t.getUTCSeconds())}Z`
  );
}

/** +0300 / -0500 */
function offsetString(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const abs = Math.abs(minutes);
  return `${sign}${pad(Math.floor(abs / 60))}${pad(abs % 60)}`;
}

export type ZoneTransition = { at: Date; from: number; to: number };

/** Offset changes of `timeZone` in [start, start + days), to the minute. */
export function zoneTransitions(timeZone: string, start: Date, days = TZ_SPAN_DAYS): ZoneTransition[] {
  const out: ZoneTransition[] = [];
  let prevT = start.getTime();
  let prev = zoneOffsetMinutes(prevT, timeZone);
  for (let i = 1; i <= days; i++) {
    const t = start.getTime() + i * DAY_MS;
    const off = zoneOffsetMinutes(t, timeZone);
    if (off !== prev) {
      // Binary search to the first minute with the new offset.
      let lo = prevT;
      let hi = t;
      while (hi - lo > MINUTE_MS) {
        const mid = Math.floor((lo + hi) / 2 / MINUTE_MS) * MINUTE_MS;
        if (zoneOffsetMinutes(mid, timeZone) === prev) lo = mid;
        else hi = mid;
      }
      out.push({ at: new Date(hi), from: prev, to: off });
      prev = off;
    }
    prevT = t;
  }
  return out;
}

function vtimezone(timeZone: string, start: Date): string[] {
  const lines = ["BEGIN:VTIMEZONE", `TZID:${timeZone}`];
  const initial = zoneOffsetMinutes(start, timeZone);
  const transitions = zoneTransitions(timeZone, start);
  const kind = (to: number, from: number) => (to > from ? "DAYLIGHT" : "STANDARD");
  // The period that contains the first occurrence; its type follows the next change.
  const firstKind = transitions.length > 0 ? (transitions[0].to > initial ? "STANDARD" : "DAYLIGHT") : "STANDARD";
  lines.push(
    `BEGIN:${firstKind}`,
    "DTSTART:19700101T000000",
    `TZOFFSETFROM:${offsetString(initial)}`,
    `TZOFFSETTO:${offsetString(initial)}`,
    `END:${firstKind}`,
  );
  for (const tr of transitions) {
    // DTSTART is the local time just before the change, in the old offset (§3.6.5).
    const local = new Date(tr.at.getTime() + tr.from * MINUTE_MS);
    const k = kind(tr.to, tr.from);
    lines.push(
      `BEGIN:${k}`,
      `DTSTART:${localStamp({
        year: local.getUTCFullYear(),
        month: local.getUTCMonth() + 1,
        day: local.getUTCDate(),
        hour: local.getUTCHours(),
        minute: local.getUTCMinutes(),
      })}`,
      `TZOFFSETFROM:${offsetString(tr.from)}`,
      `TZOFFSETTO:${offsetString(tr.to)}`,
      `END:${k}`,
    );
  }
  lines.push("END:VTIMEZONE");
  return lines;
}

export type ScheduleIcsInput = {
  roomId: string;
  roomName: string;
  schedule: Pick<RoomSchedule, "weekday" | "time" | "timeZone">;
  /** The next occurrence (DTSTART); later ones follow from the RRULE. */
  firstOccurrence: Date;
  durationMin: number;
  /** Absolute URL of the room page. */
  roomUrl: string;
  /** DTSTAMP. */
  now: Date;
  /** Host part of the UID ("lemmayard.app"). */
  uidHost: string;
};

/**
 * The calendar file. The UID depends only on the room, so re-importing an
 * updated schedule replaces the event instead of adding a second one.
 */
export function buildScheduleIcs(input: ScheduleIcsInput): string {
  const { schedule } = input;
  const start = wallTime(input.firstOccurrence, schedule.timeZone);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LemmaYard//Rooms schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...vtimezone(schedule.timeZone, input.firstOccurrence),
    "BEGIN:VEVENT",
    `UID:room-${input.roomId}-weekly@${input.uidHost}`,
    `DTSTAMP:${utcStamp(input.now)}`,
    `DTSTART;TZID=${schedule.timeZone}:${localStamp(start)}`,
    `DURATION:PT${Math.max(1, Math.round(input.durationMin))}M`,
    `RRULE:FREQ=WEEKLY;BYDAY=${ICS_WEEKDAYS[schedule.weekday]}`,
    `SUMMARY:${escapeIcsText(input.roomName)}`,
    `DESCRIPTION:${escapeIcsText(ICS_DESCRIPTION)}`,
    `URL:${input.roomUrl}`,
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

/** A safe download name: "saturday-algo-club.ics". */
export function icsFileName(roomName: string): string {
  const slug = roomName
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
  return `${slug || "room"}.ics`;
}
