// Rooms v2 results page and Members tab helpers (§2.2, §2.4, AC-V2-MX-6):
// fact tiles, timeline markers, attendance and the member ranking, for
// sessions of N = 1, 2, 4, 5 and 8 problems.
import { describe, expect, it } from "vitest";

import {
  attendance,
  attendanceText,
  membersHref,
  resultFacts,
  sortMemberStats,
  timelineMarks,
} from "@/lib/rooms/history";
import { matrixRows, type MatrixParticipantInput } from "@/lib/rooms/live-view";

const m = (mm: number, ss = 0) => mm * 60 + ss;

type C = [solve: number | null, wrong: number, first?: boolean];
function person(name: string, rank: number, cells: (C | null)[]): MatrixParticipantInput {
  const solved = cells.filter((c) => c && c[0] !== null) as C[];
  return {
    userId: `u-${name}`,
    username: name,
    isHost: false,
    rank,
    solvedCount: solved.length,
    penaltySec: solved.reduce((s, c) => s + c[0]! + 300 * c[1], 0),
    cells: cells.flatMap((c, i) =>
      c
        ? [{ position: i + 1, attempts: c[1] + (c[0] === null ? 0 : 1), wrongBefore: c[1], solveSeconds: c[0], firstSolver: c[2] ?? false, solvedBefore: false }]
        : [],
    ),
  };
}

// kit.js final sessions (N = 1, 2, 4, 5) plus an N = 8 one.
const SESSIONS: Record<number, { dur: number; people: MatrixParticipantInput[] }> = {
  1: {
    dur: 45,
    people: [
      person("alice", 1, [[m(14, 20), 0, true]]),
      person("bob", 2, [[m(26, 5), 1]]),
      person("carol", 3, [[m(38, 40), 1]]),
      person("dan", 4, [[null, 2]]),
    ],
  },
  2: {
    dur: 60,
    people: [
      person("bob", 1, [[m(11, 5), 0], [m(31, 50), 0, true]]),
      person("alice", 2, [[m(9, 40), 0], [m(44, 15), 1]]),
      person("carol", 3, [[m(7, 30), 1, true], [null, 2]]),
      person("dan", 4, [[m(41, 0), 3], null]),
    ],
  },
  4: {
    dur: 90,
    people: [
      person("alice", 1, [[m(6, 10), 0], [m(24, 30), 1, true], [m(51), 0], [null, 1]]),
      person("bob", 2, [[m(4), 0, true], [m(71, 20), 2], [m(40), 0, true], null]),
      person("carol", 3, [[m(12), 1], [m(35), 0], [m(89, 50), 0], [null, 2]]),
      person("dan", 4, [[m(33, 10), 2], null, null, null]),
    ],
  },
  5: {
    dur: 120,
    people: [
      person("bob", 1, [[m(5, 15), 0], [m(15, 40), 0], [m(88, 10), 1], [m(58, 30), 0, true], [m(116, 20), 0, true]]),
      person("alice", 2, [[m(3, 50), 0, true], [m(10, 20), 0, true], [m(29), 1, true], [m(71, 40), 1], [null, 2]]),
      person("carol", 3, [[m(4, 30), 1], [m(22, 10), 0], [m(47, 5), 0], [null, 1], null]),
      person("dan", 4, [[m(9), 0], [m(41, 30), 2], null, null, null]),
    ],
  },
  8: {
    dur: 180,
    people: [
      person("ann", 1, Array.from({ length: 8 }, (_, i): C => [m(10 + i * 15), 0, true])),
      person("ben", 2, [[m(20), 1], null, null, null, null, null, null, [null, 3]]),
    ],
  },
};

const rowsFor = (n: number, viewer: string | null = null) =>
  matrixRows(SESSIONS[n].people, Array.from({ length: n }, (_, i) => i + 1), {
    viewerId: viewer,
    durationSec: SESSIONS[n].dur * 60,
  });

describe("result facts", () => {
  it.each([
    [1, ["alice"], "alice", 1, { username: "alice", position: 1, seconds: m(14, 20) }],
    [2, ["bob"], "bob", 1, { username: "carol", position: 1, seconds: m(7, 30) }],
    [4, ["alice"], "bob", 2, { username: "bob", position: 1, seconds: m(4) }],
    [5, ["bob"], "alice", 3, { username: "alice", position: 1, seconds: m(3, 50) }],
    [8, ["ann"], "ann", 8, { username: "ann", position: 1, seconds: m(10) }],
  ] as const)("N = %i: winner, most first solves, fastest solve", (n, winners, topFirst, topCount, fastest) => {
    const facts = resultFacts(rowsFor(n));
    expect(facts.winners.map((w) => w.username)).toEqual(winners);
    expect(facts.firstSolves[0]).toEqual({ username: topFirst, count: topCount });
    expect(facts.fastest).toEqual(fastest);
  });

  it("fastest uses the split (time spent), not the time from the start", () => {
    // bob: 40:00 then 41:00 → a 1:00 split beats alice's 5:00 first solve.
    const rows = matrixRows(
      [person("alice", 2, [[m(5), 0], null]), person("bob", 1, [[m(40), 0], [m(41), 0]])],
      [1, 2],
      { viewerId: null },
    );
    expect(resultFacts(rows).fastest).toEqual({ username: "bob", position: 2, seconds: 60 });
  });

  it("nobody solved: no winner, no fastest", () => {
    const rows = matrixRows([person("x", 1, [[null, 1]])], [1], { viewerId: null });
    expect(resultFacts(rows)).toEqual({ winners: [], firstSolves: [], fastest: null });
  });
});

describe("timeline markers (AC-V2-MX-6)", () => {
  it.each([1, 2, 4, 5, 8])("N = %i: one marker per solve at solveSeconds / duration, in time order", (n) => {
    const dur = SESSIONS[n].dur * 60;
    for (const r of rowsFor(n)) {
      const marks = timelineMarks(r.cells, dur);
      expect(marks).toHaveLength(r.solved);
      for (const mk of marks) {
        expect(mk.left).toBeCloseTo(mk.solveSeconds / dur, 6);
        expect(mk.left).toBeGreaterThanOrEqual(0);
        expect(mk.left).toBeLessThanOrEqual(1);
      }
      expect(marks.map((x) => x.solveSeconds)).toEqual([...marks.map((x) => x.solveSeconds)].sort((a, b) => a - b));
    }
  });

  it("carol's late solve of Problem 3 at 1:29:50 sits near the end", () => {
    const carol = rowsFor(4).find((r) => r.username === "carol")!;
    expect(timelineMarks(carol.cells, 5400).map((x) => [x.position, Number(x.left.toFixed(3))])).toEqual([
      [1, 0.133],
      [2, 0.389],
      [3, 0.998],
    ]);
  });
});

describe("attendance (§2.4)", () => {
  const day = (d: number) => new Date(Date.UTC(2026, 9, d, 18));
  // Newest first, 8 sessions on Oct 24, 17, 10, 3, Sep 26 …
  const sessions = [24, 17, 10, 3, -4, -11, -18, -25].map((d, i) => ({
    startedAt: day(d),
    participants: new Set(i === 2 ? ["a", "c"] : i === 5 ? ["a", "b"] : ["a", "b", "c"]),
  }));

  it("7 of last 8 · streak 2 (missed the third newest)", () => {
    const b = attendance(sessions, { userId: "b", joinedAt: day(-40) });
    expect(b).toMatchObject({ played: 7, of: 8, streak: 2, sinceJoining: false });
    expect(b.marks).toEqual(["played", "played", "played", "played", "played", "missed", "played", "played"]);
    expect(attendanceText(b)).toBe("7 of last 8 · streak 2");
    expect(attendanceText(attendance(sessions, { userId: "a", joinedAt: day(-40) }))).toBe("8 of last 8 · streak 8");
  });

  it("joined recently: earlier sessions are 'before', the text says since joining", () => {
    const dan = attendance(
      sessions.map((s, i) => (i < 2 ? { ...s, participants: new Set([...s.participants, "d"]) } : s)),
      { userId: "d", joinedAt: day(15) },
    );
    expect(dan.marks).toEqual(["before", "before", "before", "before", "before", "before", "played", "played"]);
    expect(attendanceText(dan)).toBe("2 of 2 since joining");
  });

  it("fewer than 8 sessions and none at all", () => {
    expect(attendanceText(attendance(sessions.slice(0, 1), { userId: "a", joinedAt: null }))).toBe("1 of last 1");
    expect(attendanceText(attendance([], { userId: "a", joinedAt: null }))).toBe("No sessions yet");
  });
});

describe("members ranking", () => {
  it("members first, then wins, solved, first solves, username", () => {
    const rows = [
      { userId: "1", username: "zed", isMember: false, solved: 99, firstSolves: 9, wins: 9 },
      { userId: "2", username: "bob", isMember: true, solved: 10, firstSolves: 1, wins: 2 },
      { userId: "3", username: "amy", isMember: true, solved: 10, firstSolves: 1, wins: 2 },
      { userId: "4", username: "cat", isMember: true, solved: 12, firstSolves: 0, wins: 2 },
      { userId: "5", username: "dan", isMember: true, solved: 3, firstSolves: 5, wins: 3 },
    ];
    expect(sortMemberStats(rows).map((r) => r.username)).toEqual(["dan", "cat", "amy", "bob", "zed"]);
    expect(membersHref("r", "3m")).toBe("/rooms/r?tab=members");
    expect(membersHref("r", "4w")).toBe("/rooms/r?tab=members&range=4w");
  });
});
