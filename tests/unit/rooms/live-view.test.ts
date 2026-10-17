import { describe, expect, it } from "vitest";

import type { SessionSnapshot, SnapshotCell } from "@/lib/rooms/events";
import {
  cellView,
  myProblemStatus,
  pendingJudgingText,
  problemName,
  problemSummary,
  progressSummary,
  progressText,
  scoreboardRows,
  sessionProblemHref,
} from "@/lib/rooms/live-view";

const cell = (position: number, attempts: number, wrongBefore: number, solveSeconds: number | null, firstSolver = false): SnapshotCell => ({
  position,
  attempts,
  wrongBefore,
  solveSeconds,
  firstSolver,
  solvedBefore: false,
});

// Spec §6.4 sample session (final state).
const snapshot: SessionSnapshot = {
  session: { status: "finished", startedAt: "2026-10-24T18:00:00.000Z", endsAt: "2026-10-24T19:30:00.000Z", durationMin: 90, problemCount: 4 },
  problems: [
    { position: 1, slug: "valid-anagram", title: "Valid Anagram", difficulty: "easy", tags: [] },
    { position: 2, slug: "house-robber", title: "House Robber", difficulty: "medium", tags: [] },
    { position: 3, slug: "coin-change", title: "Coin Change", difficulty: "medium", tags: [] },
    { position: 4, slug: "edit-distance", title: "Edit Distance", difficulty: "hard", tags: [] },
  ],
  participants: [
    {
      userId: "a", username: "alice", isHost: true, solvedCount: 3, penaltySec: 5200, rank: 1,
      cells: [cell(1, 1, 0, 370), cell(2, 2, 1, 1470, true), cell(3, 1, 0, 3060), cell(4, 1, 1, null)],
    },
    {
      userId: "c", username: "carol", isHost: false, solvedCount: 3, penaltySec: 8510, rank: 2,
      cells: [cell(1, 2, 1, 720), cell(2, 1, 0, 2100), cell(3, 1, 0, 5390)],
    },
    {
      userId: "b", username: "bob", isHost: false, solvedCount: 2, penaltySec: 2640, rank: 3,
      cells: [cell(1, 1, 0, 240, true), cell(2, 1, 1, null), cell(3, 1, 0, 2400, true)],
    },
  ],
};

describe("scoreboard rows", () => {
  it("formats totals with the scoreboard time format and keeps the snapshot order", () => {
    const rows = scoreboardRows(snapshot, "c");
    expect(rows.map((r) => [r.rank, r.username, r.solved, r.time, r.isViewer])).toEqual([
      [1, "alice", 3, "1:26:40", false],
      [2, "carol", 3, "2:21:50", true],
      [3, "bob", 2, "44:00", false],
    ]);
    expect(rows[0].isHost).toBe(true);
    expect(rows[2].cells.map((c) => c.state)).toEqual(["solved", "attempted", "solved", "untouched"]);
  });

  it("solved cell: time, wrong attempts, first marker and the screen-reader sentence", () => {
    const v = cellView(cell(2, 2, 1, 1421, true), 2);
    expect(v).toMatchObject({ state: "solved", time: "23:41", wrong: "−1", firstSolver: true });
    expect(v.srText).toBe("Problem 2: solved at 23 minutes 41 seconds after 1 wrong attempt, first to solve");
  });

  it("attempted and untouched cells never reveal verdicts", () => {
    expect(cellView(cell(3, 2, 0, null), 3)).toMatchObject({ state: "attempted", wrong: "−2", srText: "Problem 3: not solved yet, 2 attempts" });
    expect(cellView(undefined, 4)).toMatchObject({ state: "untouched", time: null, srText: "Problem 4: no attempts" });
  });

  it("nothing solved → time is a dash", () => {
    const s = { ...snapshot, participants: [{ ...snapshot.participants[2], solvedCount: 0, penaltySec: 0 }] };
    expect(scoreboardRows(s, null)[0].time).toBe("—");
  });
});

describe("viewer status and banner progress", () => {
  it("my problem status in words", () => {
    expect(myProblemStatus(snapshot, "a", 2)).toEqual({ state: "solved", text: "Solved 24:30" });
    expect(myProblemStatus(snapshot, "a", 4)).toEqual({ state: "attempted", text: "Attempted" });
    expect(myProblemStatus(snapshot, "c", 4)).toEqual({ state: "untouched", text: "Not started" });
    expect(myProblemStatus(snapshot, "nobody", 1).text).toBe("Not started");
  });

  it("You x/N · Leader y/N", () => {
    expect(progressText(progressSummary(snapshot, "b"))).toBe("You 2/4 · Leader 3/4");
    expect(progressText(progressSummary(snapshot, "watcher"))).toBe("Leader 3/4");
  });

  it("per-problem summary with first solvers", () => {
    expect(problemSummary(snapshot, 2)).toBe("solved by 2 of 3 · first: alice 24:30");
    expect(problemSummary(snapshot, 4)).toBe("solved by 0 of 3");
  });
});

describe("copy helpers", () => {
  it("names and links", () => {
    expect(problemName(snapshot.problems[2], 3)).toBe("Problem 3 · Coin Change");
    expect(problemName({ position: 3 }, 3)).toBe("Problem 3");
    expect(sessionProblemHref("coin-change", "s1")).toBe("/problems/coin-change?session=s1");
  });

  it("pending judging", () => {
    expect(pendingJudgingText(0)).toBeNull();
    expect(pendingJudgingText(1)).toBe("Judging 1 submission… results may still change");
    expect(pendingJudgingText(2)).toBe("Judging 2 submissions… results may still change");
  });
});
