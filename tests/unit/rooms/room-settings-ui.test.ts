// Rooms v2 (V2-2) pure helpers behind the room page, rooms list and Settings
// tab: attendance strip, preset/schedule form mapping, lobby ↔ preset
// tiles, room colors, rooms-list chips and sort, self-rating result copy.
import { describe, expect, it } from "vitest";

import { attendanceShort, memberAttendance, type AttendanceSession } from "@/lib/rooms/attendance";
import {
  applyPresetToLobby,
  emptyPresetForm,
  formToPresetInput,
  lobbyMatchesPreset,
  minutesPerProblem,
  presetFormFromLobby,
  presetSummary,
  presetToForm,
  ratedHelp,
  sameSchedule,
  scheduleToForm,
  validatePresetForm,
  validateScheduleForm,
  type LobbyPresetFields,
} from "@/lib/rooms/preset-form";
import { ROOM_COLORS, roomColor, roomInitial } from "@/lib/rooms/room-colors";
import { CODE_DEFAULT_PRESET, ROOM_COLOR_COUNT, type SessionTemplate } from "@/lib/rooms/room-defaults";
import { selfRatingResultCopy } from "@/lib/rooms/self-rating-copy";
import { chipsFor, sortRoomList } from "@/server/rooms/room-list";

const s = (id: string, day: number, ids: string[]): AttendanceSession => ({
  id,
  startedAt: new Date(Date.UTC(2026, 8, day, 15)).toISOString(),
  participantIds: ids,
});

describe("memberAttendance", () => {
  const sessions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((d) => s(`s${d}`, d, d === 4 ? ["b"] : ["a", "b"]));

  it("last 8 sessions, oldest first; played / missed; streak", () => {
    const a = memberAttendance("a", "2026-01-01T00:00:00Z", sessions);
    expect(a.marks).toHaveLength(8);
    expect(a.marks).toEqual(["played", "missed", "played", "played", "played", "played", "played", "played"]);
    expect(a.played).toBe(7);
    expect(a.streak).toBe(6);
    expect(a.label).toBe("7 of last 8 · streak 6");
    expect(a.ariaLabel).toBe("Played 7 of the last 8 sessions");
    expect(attendanceShort(a)).toBe("played 7 of last 8");
  });

  it("sessions before joining are a dash, not a miss: '2 of 2 since joining'", () => {
    const a = memberAttendance("c", "2026-09-08T16:00:00Z", [...sessions.slice(0, 8), s("s9", 9, ["c"]), s("s10", 10, ["c"])]);
    expect(a.marks.filter((m) => m === "before")).toHaveLength(6);
    expect(a.label).toBe("2 of 2 since joining");
    expect(attendanceShort(a)).toBe("played 2 of 2 since joining");
  });

  it("no sessions; joined after the last one; a missed latest session ends the streak", () => {
    expect(memberAttendance("a", "2026-01-01T00:00:00Z", []).label).toBe("No sessions yet");
    expect(memberAttendance("z", "2026-12-01T00:00:00Z", sessions).label).toBe("Joined after the last session");
    const missedLast = memberAttendance("a", "2026-01-01T00:00:00Z", [s("x", 1, ["a"]), s("y", 2, [])]);
    expect(missedLast.label).toBe("1 of last 2");
    expect(attendanceShort({ played: 0, eligible: 0, marks: [] })).toBeNull();
  });
});

describe("preset form", () => {
  const preset: SessionTemplate = {
    id: "abc12345",
    name: "Saturday",
    problemCount: 4,
    durationMin: 90,
    mode: "rating",
    challenge: "balanced",
    tags: ["string", "array"],
    avoidSolved: true,
    rated: true,
  };

  it("round-trips a preset; a custom mix only in difficulty mode", () => {
    expect(formToPresetInput(presetToForm(preset))).toEqual({ ...preset, tags: ["array", "string"] });
    const diff = { ...presetToForm(preset), mode: "difficulty" as const, mixMode: "manual" as const, mix: { easy: 1, medium: 2, hard: 1 } };
    expect(formToPresetInput(diff).mix).toEqual({ easy: 1, medium: 2, hard: 1 });
    expect(formToPresetInput({ ...diff, mode: "rating" }).mix).toBeUndefined();
    expect(formToPresetInput({ ...emptyPresetForm(), name: "  New " })).not.toHaveProperty("id");
  });

  it("validation messages come from the shared Zod schemas", () => {
    const bad = validatePresetForm({ ...emptyPresetForm(), name: " ", durationMin: 17 });
    expect(bad).toEqual({ ok: false, fieldErrors: { name: "Name the preset", durationMin: "Use a multiple of 5 minutes" } });
    const mix = validatePresetForm({ ...emptyPresetForm(), name: "Mix", mode: "difficulty", mixMode: "manual", mix: { easy: 1, medium: 1, hard: 1 } });
    expect(mix).toEqual({ ok: false, fieldErrors: { mix: "The custom mix must add up to 4" } });
    const long = validatePresetForm({ ...emptyPresetForm(), name: "x".repeat(31) });
    expect(long.ok).toBe(false);
    expect(validatePresetForm({ ...emptyPresetForm(), name: "Saturday" }).ok).toBe(true);
  });

  it("summaries and help", () => {
    expect(presetSummary(preset)).toBe("90 min · 4 problems · by rating · balanced");
    expect(presetSummary({ ...preset, problemCount: 1, durationMin: 30, mode: "difficulty", mix: { easy: 0, medium: 0, hard: 1 } })).toBe(
      "30 min · 1 problem · by difficulty · 1 hard",
    );
    expect(presetSummary({ ...preset, mode: "manual" })).toBe("90 min · 4 problems · picked by hand");
    expect(presetSummary(CODE_DEFAULT_PRESET)).toBe("90 min · 4 problems · by rating · balanced");
    expect(minutesPerProblem(90, 4)).toBe("about 23 min per problem");
    expect(ratedHelp(90, 4)).toMatch(/^Results update ratings/);
    expect(ratedHelp(30, 4)).toMatch(/Very short sessions/);
  });
});

describe("schedule form", () => {
  it("off → {schedule: null}; on → the validated schedule", () => {
    const off = scheduleToForm(null, "Europe/Kyiv");
    expect(off).toEqual({ enabled: false, weekday: 6, time: "18:00", timeZone: "Europe/Kyiv", presetId: "" });
    expect(validateScheduleForm(off)).toEqual({ ok: true, body: { schedule: null } });
    expect(validateScheduleForm({ ...off, enabled: true })).toEqual({
      ok: true,
      body: { schedule: { weekday: 6, time: "18:00", timeZone: "Europe/Kyiv", presetId: null } },
    });
  });

  it("schema messages for a bad time, zone or preset id", () => {
    expect(validateScheduleForm({ enabled: true, weekday: 6, time: "25:00", timeZone: "Mars/Base", presetId: "bad id" })).toEqual({
      ok: false,
      fieldErrors: { time: "Use 24-hour time, e.g. 18:00", timeZone: "Unknown time zone", presetId: "Unknown preset" },
    });
  });

  it("sameSchedule", () => {
    const a = { weekday: 6, time: "18:00", timeZone: "Europe/Kyiv", presetId: null };
    expect(sameSchedule(a, { ...a })).toBe(true);
    expect(sameSchedule(a, { ...a, time: "18:05" })).toBe(false);
    expect(sameSchedule(null, null)).toBe(true);
    expect(sameSchedule(a, null)).toBe(false);
  });
});

describe("lobby ↔ preset tiles", () => {
  const preset: SessionTemplate = { ...CODE_DEFAULT_PRESET, id: "p1", name: "Saturday", tags: ["array"] };
  const lobby: LobbyPresetFields = {
    problemCount: 2,
    durationMin: 45,
    mode: "difficulty",
    challenge: "tough",
    tags: [],
    mixMode: "manual",
    mix: { easy: 1, medium: 1, hard: 0 },
    avoidSolved: false,
    rated: false,
    external: 0,
  };

  it("choosing a tile copies the preset's fields; the tile then reads as selected", () => {
    const applied = applyPresetToLobby({ ...lobby, plannedFor: "2026-10-24T18:00" }, preset);
    expect(applied).toMatchObject({ problemCount: 4, durationMin: 90, mode: "rating", tags: ["array"], mixMode: "suggested", rated: true });
    expect(applied.plannedFor).toBe("2026-10-24T18:00");
    expect(lobbyMatchesPreset(applied, preset)).toBe(true);
    expect(lobbyMatchesPreset({ ...applied, durationMin: 60 }, preset)).toBe(false);
    expect(lobbyMatchesPreset(lobby, preset)).toBe(false);
  });

  it("manual mode ignores the challenge; difficulty mode compares the custom mix", () => {
    const manual = { ...preset, mode: "manual" as const };
    expect(lobbyMatchesPreset({ ...applyPresetToLobby(lobby, manual), challenge: "tough" }, manual)).toBe(true);
    const mixed = { ...preset, mode: "difficulty" as const, mix: { easy: 2, medium: 1, hard: 1 } };
    const form = applyPresetToLobby(lobby, mixed);
    expect(form.mixMode).toBe("manual");
    expect(lobbyMatchesPreset(form, mixed)).toBe(true);
    expect(lobbyMatchesPreset({ ...form, mix: { easy: 1, medium: 2, hard: 1 } }, mixed)).toBe(false);
  });

  it("'+ Save current as preset' starts from the lobby fields", () => {
    expect(presetFormFromLobby(lobby, "Short")).toEqual({
      name: "Short",
      problemCount: 2,
      durationMin: 45,
      mode: "difficulty",
      challenge: "tough",
      tags: [],
      mixMode: "manual",
      mix: { easy: 1, medium: 1, hard: 0 },
      avoidSolved: false,
      rated: false,
      external: 0,
    });
    expect(presetFormFromLobby({ ...lobby, mode: "rating" }).mixMode).toBe("suggested");
  });
});

describe("room colors", () => {
  it("one literal class per palette index; fallbacks", () => {
    expect(ROOM_COLORS).toHaveLength(ROOM_COLOR_COUNT);
    expect(new Set(ROOM_COLORS.map((c) => c.tile)).size).toBe(ROOM_COLOR_COUNT);
    expect(roomColor(3).name).toBe("Amber");
    expect(roomColor(42).name).toBe("Cobalt");
    expect(roomColor(null).name).toBe("Cobalt");
    expect(roomInitial("  saturday Algo")).toBe("S");
    expect(roomInitial("🙂 42 club")).toBe("4");
    expect(roomInitial("✓✓")).toBe("#");
  });
});

describe("rooms list", () => {
  it("per-problem chips of the last session (no 'N of total')", () => {
    expect(
      chipsFor(4, [
        { position: 1, attempts: 1, solveSeconds: 610 },
        { position: 2, attempts: 2, solveSeconds: null },
        { position: 3, attempts: 0, solveSeconds: null },
      ]),
    ).toEqual([
      { position: 1, state: "solved" },
      { position: 2, state: "tried" },
      { position: 3, state: "none" },
      { position: 4, state: "none" },
    ]);
  });

  it("sort: live → lobby → next session soonest → last activity", () => {
    const base = { openSession: null, next: null, lastSessionAt: null, joinedAt: "2026-01-01T00:00:00Z" };
    const rooms = [
      { ...base, id: "old", lastSessionAt: "2026-09-01T00:00:00Z" },
      { ...base, id: "recent", lastSessionAt: "2026-10-10T00:00:00Z" },
      { ...base, id: "next-late", next: { at: "2026-10-30T00:00:00Z", timeZone: "UTC", presetName: "x" } },
      { ...base, id: "next-soon", next: { at: "2026-10-20T00:00:00Z", timeZone: "UTC", presetName: "x" } },
      { ...base, id: "lobby", openSession: { status: "lobby" as const, minutesLeft: null } },
      { ...base, id: "live", openSession: { status: "live" as const, minutesLeft: 10 } },
    ];
    expect(sortRoomList(rooms).map((r) => r.id)).toEqual(["live", "lobby", "next-soon", "next-late", "recent", "old"]);
  });
});

describe("selfRatingResultCopy", () => {
  it("says what happened in plain words", () => {
    expect(selfRatingResultCopy(1650, 2, 1)).toBe(
      "Saved: 1650. It is now your starting rating in 2 rooms where you have no rated sessions yet. 1 room kept your rating, because it already comes from sessions there.",
    );
    expect(selfRatingResultCopy(1650, 0, 0)).toBe("Saved: 1650. It will be your starting point in the next room you play in.");
    expect(selfRatingResultCopy(null, 1, 0)).toBe(
      "Removed. New rooms start you from your practice or at 1500. Your starting rating was reset in 1 room where you have no rated sessions yet.",
    );
  });
});
