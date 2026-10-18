// Scoreboard matrix view model (rooms-v2 §3, AC-V2-MX-2/3/4): cell states,
// splits, wrong-attempt totals, first marks (ties), N-adaptive layout, time
// formatting, column stats and the "1✓ 2✗ 3✓ 4·" chips.
import { describe, expect, it } from "vitest";

import type { PendingCell, SessionSnapshot, SnapshotCell } from "@/lib/rooms/events";
import {
  axisTicks,
  cellSrText,
  cellView,
  chips,
  chipsSrText,
  chipsText,
  columnMetaText,
  columnStats,
  formatMinuteMark,
  formatSplit,
  matrixLayout,
  matrixRows,
  medianSeconds,
  myProblemStatus,
  pendingIndex,
  pendingJudgingText,
  problemName,
  scoreboardRows,
  sessionProblemHref,
  splitsByPosition,
  trackFraction,
  viewerChips,
  wrongAttemptTotal,
  wrongAttemptsLabel,
} from "@/lib/rooms/live-view";

const cell = (
  position: number,
  attempts: number,
  wrongBefore: number,
  solveSeconds: number | null,
  firstSolver = false,
  solvedBefore = false,
): SnapshotCell => ({ position, attempts, wrongBefore, solveSeconds, firstSolver, solvedBefore });

const m = (mm: number, ss = 0) => mm * 60 + ss;

// The mockups' N = 4 live session (kit.js), as a snapshot.
const snapshot: SessionSnapshot = {
  session: { status: "live", startedAt: "2026-10-24T18:00:00.000Z", endsAt: "2026-10-24T19:30:00.000Z", durationMin: 90, problemCount: 4 },
  problems: [
    { position: 1, slug: "best-time", title: "Best Time to Buy and Sell Stock", difficulty: "easy", tags: [] },
    { position: 2, slug: "maximum-subarray", title: "Maximum Subarray", difficulty: "easy", tags: [] },
    { position: 3, slug: "house-robber", title: "House Robber", difficulty: "medium", tags: [] },
    { position: 4, slug: "longest-substring", title: "Longest Substring", difficulty: "medium", tags: [] },
  ],
  participants: [
    {
      userId: "a", username: "alice", isHost: true, solvedCount: 2, penaltySec: m(35, 40), rank: 1,
      cells: [cell(1, 1, 0, m(6, 10)), cell(2, 2, 1, m(24, 30), true)],
    },
    {
      userId: "b", username: "bob", isHost: false, solvedCount: 2, penaltySec: m(44), rank: 2,
      cells: [cell(1, 1, 0, m(4), true), cell(2, 2, 2, null), cell(3, 1, 0, m(40), true)],
    },
    {
      userId: "c", username: "carol", isHost: false, solvedCount: 2, penaltySec: m(52), rank: 3,
      cells: [cell(1, 2, 1, m(12)), cell(2, 1, 0, m(35))],
    },
    { userId: "d", username: "dan", isHost: false, solvedCount: 0, penaltySec: 0, rank: 4, cells: [cell(1, 1, 1, null)] },
  ],
};

const pending: PendingCell[] = [
  { userId: "a", position: 3, count: 1 },
  { userId: "c", position: 4, count: 1 },
  { userId: "d", position: 1, count: 1 },
];

describe("cell states (§3.2) and sr-only sentences (AC-V2-MX-4)", () => {
  it("solved: time, split, wrong attempts, first", () => {
    const v = cellView(cell(2, 2, 1, m(24, 30), true), 2, { splitSeconds: m(18, 20), durationSec: 90 * 60 });
    expect(v).toMatchObject({ state: "solved", time: "24:30", split: "+18:20", wrong: 1, firstSolver: true, judgingAttempt: null });
    expect(v.track).toBeCloseTo(1470 / 5400);
    expect(v.srText).toBe(
      "Problem 2: solved 24 minutes 30 seconds after the start, 18 minutes 20 seconds after their previous solve, after 1 wrong attempt, first to solve it",
    );
  });

  it("solved as the person's first solve: no split; seen is spoken", () => {
    const v = cellView(cell(1, 1, 0, m(6, 10), false, true), 1);
    expect(v.split).toBeNull();
    expect(v.srText).toBe("Problem 1: solved 6 minutes 10 seconds after the start, solved before the session");
  });

  it("judging: attempt k = counted attempts + 1; solved wins over a later pending submit", () => {
    const v = cellView(cell(3, 1, 1, null), 3, { pending: 1 });
    expect(v).toMatchObject({ state: "judging", judgingAttempt: 2, time: null });
    expect(v.srText).toBe("Problem 3: a submission is being judged");
    expect(cellView(undefined, 4, { pending: 2 })).toMatchObject({ state: "judging", judgingAttempt: 1 });
    expect(cellView(cell(1, 1, 0, 60), 1, { pending: 1 }).state).toBe("solved");
  });

  it("tried and not started never reveal verdicts", () => {
    expect(cellView(cell(2, 2, 2, null), 2)).toMatchObject({ state: "attempted", wrong: 2, attempts: 2, srText: "Problem 2: 2 attempts, not solved yet" });
    expect(cellView(cell(2, 1, 1, null), 2).srText).toBe("Problem 2: 1 attempt, not solved yet");
    expect(cellView(undefined, 4)).toMatchObject({ state: "untouched", time: null, srText: "Problem 4: not attempted" });
    expect(cellView(cell(4, 0, 0, null), 4).state).toBe("untouched");
    for (const v of [cellView(cell(2, 2, 2, null), 2), cellView(cell(2, 2, 1, 600), 2)]) {
      expect(JSON.stringify(v)).not.toMatch(/wrong answer|time limit|runtime error|memory/i);
    }
  });

  it("cellSrText matches cellView for every state", () => {
    for (const v of [cellView(cell(1, 1, 0, 300), 1), cellView(undefined, 2, { pending: 1 }), cellView(cell(3, 2, 2, null), 3), cellView(undefined, 4)]) {
      expect(cellSrText(v)).toBe(v.srText);
    }
  });
});

describe("splits and totals (AC-V2-MX-2)", () => {
  it("split = time − previous solve of the same person in solve order; first solve has none", () => {
    // Solved out of position order: 3 at 4:00, 1 at 10:00, 2 at 30:00.
    const splits = splitsByPosition([cell(1, 1, 0, 600), cell(2, 1, 0, 1800), cell(3, 1, 0, 240), cell(4, 2, 2, null)]);
    expect([...splits]).toEqual([
      [3, null],
      [1, 360],
      [2, 1200],
    ]);
  });

  it("wrong attempts = Σ wrongBefore (solved) + attempts (unsolved)", () => {
    expect(wrongAttemptTotal([cell(1, 3, 2, 100), cell(2, 4, 4, null), cell(3, 0, 0, null)])).toBe(6);
    expect(wrongAttemptsLabel(0)).toBe("no wrong attempts");
    expect(wrongAttemptsLabel(1)).toBe("1 wrong attempt");
    expect(wrongAttemptsLabel(2)).toBe("2 wrong attempts");
  });

  it("rows: splits per person, totals, last solve, judging from `pending`", () => {
    const rows = scoreboardRows(snapshot, "b", pending);
    expect(rows.map((r) => [r.rank, r.username, r.solved, r.time, r.wrongTotal, r.isViewer])).toEqual([
      [1, "alice", 2, "35:40", 1, false],
      [2, "bob", 2, "44:00", 2, true],
      [3, "carol", 2, "52:00", 1, false],
      [4, "dan", 0, "—", 1, false],
    ]);
    expect(rows[0].cells.map((c) => [c.state, c.time, c.split])).toEqual([
      ["solved", "6:10", null],
      ["solved", "24:30", "+18:20"],
      ["judging", null, null],
      ["untouched", null, null],
    ]);
    expect(rows[1].cells.map((c) => c.split)).toEqual([null, null, "+36:00", null]);
    expect(rows[3].cells[0]).toMatchObject({ state: "judging", judgingAttempt: 2 });
    expect(rows[1].lastSolve).toBe("40:00");
    expect(rows[3].lastSolve).toBeNull();
  });

  it("First marks ties: both people with the earliest accept keep the flag", () => {
    const tie = [
      { userId: "x", username: "x", isHost: false, rank: 1, solvedCount: 1, penaltySec: 60, cells: [cell(1, 1, 0, 60, true)] },
      { userId: "y", username: "y", isHost: false, rank: 1, solvedCount: 1, penaltySec: 60, cells: [cell(1, 1, 0, 60, true)] },
    ];
    expect(matrixRows(tie, [1], { viewerId: null }).map((r) => r.cells[0].firstSolver)).toEqual([true, true]);
  });

  it("AC-V2-MX-3: a cell shows judging while `pending` lists it, then solved or tried on the next batch", () => {
    const before = scoreboardRows(snapshot, null, [{ userId: "d", position: 1, count: 1 }]);
    expect(before[3].cells[0].state).toBe("judging");
    const solvedSnap: SessionSnapshot = {
      ...snapshot,
      participants: snapshot.participants.map((p) => (p.userId === "d" ? { ...p, solvedCount: 1, penaltySec: 900, cells: [cell(1, 2, 1, 600)] } : p)),
    };
    expect(scoreboardRows(solvedSnap, null, [])[3].cells[0].state).toBe("solved");
    const triedSnap: SessionSnapshot = {
      ...snapshot,
      participants: snapshot.participants.map((p) => (p.userId === "d" ? { ...p, cells: [cell(1, 2, 2, null)] } : p)),
    };
    expect(scoreboardRows(triedSnap, null, [])[3].cells[0]).toMatchObject({ state: "attempted", attempts: 2 });
  });

  it("pendingIndex sums counts per pair", () => {
    expect(pendingIndex([{ userId: "a", position: 1, count: 1 }, { userId: "a", position: 1, count: 2 }]).get("a:1")).toBe(3);
  });
});

describe("layout by N (§3.1, AC-V2-MX-1)", () => {
  it.each([
    [1, "wide", true, true, 300],
    [2, "wide", true, true, 260],
    [3, "standard", true, false, 230],
    [4, "standard", true, false, 230],
    [5, "narrow", true, false, 210],
    [6, "compact", false, false, 200],
    [8, "compact", false, false, 200],
  ] as const)("N = %i → %s (track %s, axis %s, name col %i)", (n, variant, track, axis, nameCol) => {
    expect(matrixLayout(n)).toMatchObject({ variant, track, axis, nameCol });
  });

  it("headers: judging count only for N < 5, medians for N ≤ 4, the words First/first solve for N ≤ 4", () => {
    expect(matrixLayout(4)).toMatchObject({ headerJudging: true, median: true, words: true });
    expect(matrixLayout(5)).toMatchObject({ headerJudging: false, median: false, words: false });
    const rows = scoreboardRows(snapshot, null, pending);
    expect(columnMetaText(columnStats(rows, 3), matrixLayout(4), false)).toBe("1 solved · 1 judging");
    expect(columnMetaText(columnStats(rows, 3), matrixLayout(5), false)).toBe("1 solved");
    expect(columnMetaText(columnStats(rows, 1), matrixLayout(4), true)).toBe("3 solved · median 6:10");
    expect(columnMetaText(columnStats(rows, 4), matrixLayout(4), true)).toBe("0 solved");
  });
});

describe("time formatting", () => {
  it("split, minute marks, axis, track", () => {
    expect(formatSplit(m(18, 20))).toBe("+18:20");
    expect(formatSplit(m(64, 5))).toBe("+1:04:05");
    expect(formatMinuteMark(m(24, 30))).toBe("25′");
    expect(formatMinuteMark(0)).toBe("0′");
    expect(axisTicks(45 * 60)).toEqual(["0:00", "11:15", "22:30", "33:45", "45:00"]);
    expect(axisTicks(90 * 60)).toEqual(["0:00", "22:30", "45:00", "1:07:30", "1:30:00"]);
    expect(trackFraction(2700, 5400)).toBe(0.5);
    expect(trackFraction(9999, 5400)).toBe(1);
    expect(trackFraction(10, 0)).toBe(0);
  });

  it("median of solve times (even count: mean of the middle two, floored)", () => {
    expect(medianSeconds([])).toBeNull();
    expect(medianSeconds([300])).toBe(300);
    expect(medianSeconds([400, 100, 200])).toBe(200);
    expect(medianSeconds([100, 201])).toBe(150);
  });
});

describe("chips summary (You: 1✓ 2✗ 3✓ 4·)", () => {
  it("one mark per problem, judging as …, with an sr-only sentence", () => {
    const mine = viewerChips(snapshot, "b", pending)!;
    expect(chipsText(mine)).toBe("1✓ 2✗ 3✓ 4·");
    expect(chipsSrText(mine)).toBe("Problem 1 solved, Problem 2 tried, not solved, Problem 3 solved, Problem 4 not started");
    expect(chipsText(viewerChips(snapshot, "d", pending)!)).toBe("1… 2· 3· 4·");
    expect(viewerChips(snapshot, "watcher", pending)).toBeNull();
    expect(chips([])).toEqual([]);
  });
});

describe("viewer status and copy", () => {
  it("my problem status in words", () => {
    expect(myProblemStatus(snapshot, "a", 2)).toEqual({ state: "solved", text: "Solved 24:30" });
    expect(myProblemStatus(snapshot, "a", 3, pending)).toEqual({ state: "judging", text: "Judging…" });
    expect(myProblemStatus(snapshot, "b", 2)).toEqual({ state: "attempted", text: "Attempted" });
    expect(myProblemStatus(snapshot, "c", 4)).toEqual({ state: "untouched", text: "Not started" });
    expect(myProblemStatus(snapshot, "nobody", 1).text).toBe("Not started");
  });

  it("names and links", () => {
    expect(problemName(snapshot.problems[2], 3)).toBe("Problem 3 · House Robber");
    expect(problemName({ position: 3 }, 3)).toBe("Problem 3");
    expect(sessionProblemHref("coin-change", "s1")).toBe("/problems/coin-change?session=s1");
  });

  it("pending judging", () => {
    expect(pendingJudgingText(0)).toBeNull();
    expect(pendingJudgingText(1)).toBe("Judging 1 submission… results may still change");
    expect(pendingJudgingText(2)).toBe("Judging 2 submissions… results may still change");
  });
});
