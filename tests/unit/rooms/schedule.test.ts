// Rooms v2 §5, AC-V2-DEF-2: weekly schedule math across time zones and DST.
import { describe, expect, it } from "vitest";

import {
  formatOccurrence,
  nextOccurrence,
  relativeWhen,
  scheduleCadence,
  scheduleSummary,
  wallTime,
  zonedTimeToUtc,
  zoneOffsetMinutes,
} from "@/lib/rooms/schedule";

const kyivSat = { weekday: 6, time: "18:00", timeZone: "Europe/Kyiv" };
const iso = (d: Date) => d.toISOString();

describe("zone helpers", () => {
  it("offsets of Europe/Kyiv in summer and winter", () => {
    expect(zoneOffsetMinutes(Date.parse("2026-07-01T12:00:00Z"), "Europe/Kyiv")).toBe(180);
    expect(zoneOffsetMinutes(Date.parse("2026-12-01T12:00:00Z"), "Europe/Kyiv")).toBe(120);
    expect(zoneOffsetMinutes(Date.parse("2026-07-01T12:00:00Z"), "America/New_York")).toBe(-240);
    expect(zoneOffsetMinutes(Date.parse("2026-07-01T12:00:00Z"), "UTC")).toBe(0);
  });

  it("wall time and weekday in a zone", () => {
    // 2026-10-24 is a Saturday; 15:00Z = 18:00 in Kyiv (EEST, +3).
    expect(wallTime(Date.parse("2026-10-24T15:00:00Z"), "Europe/Kyiv")).toMatchObject({
      year: 2026,
      month: 10,
      day: 24,
      hour: 18,
      minute: 0,
      weekday: 6,
    });
  });

  it("local → UTC, including a time skipped by the spring change", () => {
    expect(iso(zonedTimeToUtc({ year: 2026, month: 10, day: 24, hour: 18, minute: 0 }, "Europe/Kyiv"))).toBe("2026-10-24T15:00:00.000Z");
    expect(iso(zonedTimeToUtc({ year: 2026, month: 12, day: 5, hour: 18, minute: 0 }, "Europe/Kyiv"))).toBe("2026-12-05T16:00:00.000Z");
    // 2027-03-28 03:00 → 04:00 in Kyiv: 03:30 does not exist and lands after the gap (04:30 EEST).
    const skipped = zonedTimeToUtc({ year: 2027, month: 3, day: 28, hour: 3, minute: 30 }, "Europe/Kyiv");
    expect(iso(skipped)).toBe("2027-03-28T01:30:00.000Z");
    expect(wallTime(skipped, "Europe/Kyiv")).toMatchObject({ hour: 4, minute: 30 });
    // 2026-10-25 04:00 → 03:00: 03:30 exists twice; either instance shows 03:30.
    const repeated = zonedTimeToUtc({ year: 2026, month: 10, day: 25, hour: 3, minute: 30 }, "Europe/Kyiv");
    expect(wallTime(repeated, "Europe/Kyiv")).toMatchObject({ hour: 3, minute: 30 });
  });
});

describe("nextOccurrence (AC-V2-DEF-2)", () => {
  it("the coming Saturday 18:00 Europe/Kyiv", () => {
    expect(iso(nextOccurrence(kyivSat, new Date("2026-10-18T12:00:00Z")))).toBe("2026-10-24T15:00:00.000Z");
  });

  it("across the October change: summer → winter offset next week", () => {
    // After Oct 24 (EEST, +3) the next one, Oct 31, is in EET (+2): 16:00Z.
    expect(iso(nextOccurrence(kyivSat, new Date("2026-10-24T15:01:00Z")))).toBe("2026-10-31T16:00:00.000Z");
  });

  it("across the March change: winter → summer offset", () => {
    expect(iso(nextOccurrence(kyivSat, new Date("2027-03-22T09:00:00Z")))).toBe("2027-03-27T16:00:00.000Z");
    expect(iso(nextOccurrence(kyivSat, new Date("2027-03-27T16:01:00Z")))).toBe("2027-04-03T15:00:00.000Z");
  });

  it("now inside the occurrence minute → that occurrence; one minute later → next week", () => {
    expect(iso(nextOccurrence(kyivSat, new Date("2026-10-24T15:00:00Z")))).toBe("2026-10-24T15:00:00.000Z");
    expect(iso(nextOccurrence(kyivSat, new Date("2026-10-24T15:00:59Z")))).toBe("2026-10-24T15:00:00.000Z");
    expect(iso(nextOccurrence(kyivSat, new Date("2026-10-24T15:01:00Z")))).toBe("2026-10-31T16:00:00.000Z");
  });

  it("an occurrence a finished session already used (planned_for) → next week", () => {
    const now = new Date("2026-10-24T13:00:00Z");
    expect(iso(nextOccurrence(kyivSat, now, ["2026-10-24T15:00:00.000Z"]))).toBe("2026-10-31T16:00:00.000Z");
    expect(iso(nextOccurrence(kyivSat, now, [new Date("2026-10-17T15:00:00Z")]))).toBe("2026-10-24T15:00:00.000Z");
  });

  it("weekday wrap near midnight in a zone west of UTC", () => {
    const sunLate = { weekday: 0, time: "23:30", timeZone: "America/New_York" };
    // Sunday Oct 18 22:00 in New York = Monday 02:00Z: today's 23:30 is still ahead.
    expect(iso(nextOccurrence(sunLate, new Date("2026-10-19T02:00:00Z")))).toBe("2026-10-19T03:30:00.000Z");
  });

  it("a zone east of UTC where the local day is already tomorrow", () => {
    const monEarly = { weekday: 1, time: "07:00", timeZone: "Pacific/Auckland" };
    // Sunday 20:00Z = Monday 09:00 in Auckland (NZDT +13): this Monday's 07:00 has passed → next Monday.
    expect(iso(nextOccurrence(monEarly, new Date("2026-10-18T20:00:00Z")))).toBe("2026-10-25T18:00:00.000Z");
  });

  it("always lands on the scheduled weekday and time for a year of daily 'now's", () => {
    for (let d = 0; d < 366; d += 1) {
      const now = new Date(Date.UTC(2026, 0, 1, 7) + d * 86_400_000);
      const at = nextOccurrence(kyivSat, now);
      const w = wallTime(at, "Europe/Kyiv");
      expect(w.weekday).toBe(6);
      expect([w.hour, w.minute]).toEqual([18, 0]);
      expect(at.getTime()).toBeGreaterThan(now.getTime() - 60_000);
      expect(at.getTime() - now.getTime()).toBeLessThanOrEqual(7 * 86_400_000);
    }
  });
});

describe("copy", () => {
  it("formats in the schedule's zone", () => {
    expect(formatOccurrence("2026-10-24T15:00:00.000Z", "Europe/Kyiv")).toBe("Sat, Oct 24 · 18:00");
    expect(scheduleCadence(kyivSat)).toBe("every Saturday");
    expect(scheduleSummary(kyivSat)).toBe("Saturdays at 18:00 (Europe/Kyiv)");
  });

  it("relative time in calendar days of the zone", () => {
    const at = "2026-10-24T15:00:00.000Z";
    expect(relativeWhen(at, new Date("2026-10-22T09:00:00Z"), "Europe/Kyiv")).toBe("in 2 days");
    expect(relativeWhen(at, new Date("2026-10-23T20:00:00Z"), "Europe/Kyiv")).toBe("tomorrow");
    expect(relativeWhen(at, new Date("2026-10-24T12:00:00Z"), "Europe/Kyiv")).toBe("in 3 hours");
    expect(relativeWhen(at, new Date("2026-10-24T14:35:00Z"), "Europe/Kyiv")).toBe("in 25 min");
    expect(relativeWhen(at, new Date("2026-10-24T15:00:00Z"), "Europe/Kyiv")).toBe("now");
    // 22:30 Kyiv on Friday: tomorrow by the calendar, though under 24 h.
    expect(relativeWhen(at, new Date("2026-10-23T19:30:00Z"), "Europe/Kyiv")).toBe("tomorrow");
  });
});
