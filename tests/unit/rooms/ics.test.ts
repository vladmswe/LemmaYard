// Rooms v2 §5, §14, AC-V2-DEF-4: the "Add to calendar" file.
import { describe, expect, it } from "vitest";

import { buildScheduleIcs, escapeIcsText, foldIcsLine, icsFileName, zoneTransitions } from "@/lib/rooms/ics";
import { nextOccurrence, wallTime } from "@/lib/rooms/schedule";

import { offsetFromVtimezone, parseIcs, prop } from "../../helpers/ics";

const ROOM = "7b368ada-8d20-4093-9313-7b30dc08122c";

function build(over: Partial<Parameters<typeof buildScheduleIcs>[0]> = {}) {
  const schedule = { weekday: 6, time: "18:00", timeZone: "Europe/Kyiv" };
  const now = new Date("2026-10-18T12:00:00Z");
  return buildScheduleIcs({
    roomId: ROOM,
    roomName: "Saturday Algo Club",
    schedule,
    firstOccurrence: nextOccurrence(schedule, now),
    durationMin: 90,
    roomUrl: `https://lemmayard.example/rooms/${ROOM}`,
    now,
    uidHost: "lemmayard.example",
    ...over,
  });
}

describe("buildScheduleIcs", () => {
  it("is a valid RFC 5545 calendar with one weekly event", () => {
    const cal = parseIcs(build());
    const event = cal.children.find((c) => c.name === "VEVENT")!;
    expect(prop(event, "DTSTART")).toEqual({ name: "DTSTART", params: { TZID: "Europe/Kyiv" }, value: "20261024T180000" });
    expect(prop(event, "RRULE")!.value).toBe("FREQ=WEEKLY;BYDAY=SA");
    expect(prop(event, "DURATION")!.value).toBe("PT90M");
    expect(prop(event, "SUMMARY")!.value).toBe("Saturday Algo Club");
    expect(prop(event, "DESCRIPTION")!.value).toBe("LemmaYard room session");
    expect(prop(event, "URL")!.value).toBe(`https://lemmayard.example/rooms/${ROOM}`);
    expect(prop(event, "DTSTAMP")!.value).toBe("20261018T120000Z");
  });

  it("has a stable UID per room (re-import replaces the event)", () => {
    const a = parseIcs(build());
    const b = parseIcs(build({ now: new Date("2026-11-01T08:00:00Z"), roomName: "Renamed" }));
    const uid = (c: ReturnType<typeof parseIcs>) => prop(c.children.find((x) => x.name === "VEVENT")!, "UID")!.value;
    expect(uid(a)).toBe(`room-${ROOM}-weekly@lemmayard.example`);
    expect(uid(b)).toBe(uid(a));
  });

  it("the VTIMEZONE gives the real offset for every weekly occurrence for two years (DST)", () => {
    const schedule = { weekday: 6, time: "18:00", timeZone: "Europe/Kyiv" };
    const cal = parseIcs(build());
    const tz = cal.children.find((c) => c.name === "VTIMEZONE")!;
    expect(prop(tz, "TZID")!.value).toBe("Europe/Kyiv");
    let at = nextOccurrence(schedule, new Date("2026-10-18T12:00:00Z"));
    for (let i = 0; i < 104; i++) {
      const w = wallTime(at, "Europe/Kyiv");
      const local = `${w.year}${String(w.month).padStart(2, "0")}${String(w.day).padStart(2, "0")}T180000`;
      const fromFile = offsetFromVtimezone(tz, local);
      expect(Date.parse(`${local.slice(0, 4)}-${local.slice(4, 6)}-${local.slice(6, 8)}T18:00:00Z`) - fromFile * 60_000).toBe(at.getTime());
      at = nextOccurrence(schedule, new Date(at.getTime() + 60_000));
    }
  });

  it("a zone without DST has one STANDARD period", () => {
    const schedule = { weekday: 3, time: "12:30", timeZone: "Asia/Tokyo" };
    const now = new Date("2026-10-18T00:00:00Z");
    const cal = parseIcs(build({ schedule, firstOccurrence: nextOccurrence(schedule, now), now }));
    const tz = cal.children.find((c) => c.name === "VTIMEZONE")!;
    expect(tz.children.map((c) => c.name)).toEqual(["STANDARD"]);
    expect(prop(tz.children[0], "TZOFFSETTO")!.value).toBe("+0900");
    expect(prop(cal.children.find((c) => c.name === "VEVENT")!, "RRULE")!.value).toBe("FREQ=WEEKLY;BYDAY=WE");
  });

  it("contains no invite token or member names, only the room name and URL", () => {
    const text = build();
    expect(text).not.toMatch(/invite|token|#/i);
    expect(text).not.toMatch(/ATTENDEE|ORGANIZER/);
  });

  it("escapes and folds long or special names", () => {
    const name = "Ünïcödé, team; with \\ backslash and a very long name that needs folding at 75 octets ✓✓✓";
    const text = build({ roomName: name });
    const cal = parseIcs(text); // throws on lines over 75 octets
    expect(prop(cal.children.find((c) => c.name === "VEVENT")!, "SUMMARY")!.value).toBe(escapeIcsText(name));
  });
});

describe("pieces", () => {
  it("escapeIcsText", () => {
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("foldIcsLine keeps UTF-8 sequences whole and lines ≤ 75 octets", () => {
    const folded = foldIcsLine(`SUMMARY:${"ж".repeat(80)}`);
    for (const l of folded.split("\r\n")) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").map((l, i) => (i === 0 ? l : l.slice(1))).join("")).toBe(`SUMMARY:${"ж".repeat(80)}`);
  });

  it("zoneTransitions finds the Kyiv changes to the minute", () => {
    const t = zoneTransitions("Europe/Kyiv", new Date("2026-10-01T00:00:00Z"), 200);
    expect(t.map((x) => [x.at.toISOString(), x.from, x.to])).toEqual([
      ["2026-10-25T01:00:00.000Z", 180, 120],
      ["2027-03-28T01:00:00.000Z", 120, 180],
    ]);
  });

  it("icsFileName", () => {
    expect(icsFileName("Saturday Algo Club")).toBe("saturday-algo-club.ics");
    expect(icsFileName("Ünï / ✓")).toBe("uni.ics");
    expect(icsFileName("✓✓")).toBe("room.ics");
  });
});
