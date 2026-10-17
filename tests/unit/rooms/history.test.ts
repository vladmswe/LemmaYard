// Pure history/stats helpers of Rooms R5 (docs/specs/rooms.md §4.1, §4.2,
// §4.5, §5.2) with the spec's §6.4 numbers.
import { describe, expect, it } from "vitest";

import {
  cellSrText,
  leaderboardHref,
  parseLeaderboardRange,
  parsePageParam,
  penaltyBreakdown,
  progressSeries,
  rankLeaderboard,
  roomHistoryHref,
  sessionRunMinutes,
  solutionAccess,
  solvedProblemLabel,
  solveRate,
  spokenDuration,
  summarizeProblem,
  timelineTotals,
  type LeaderboardInput,
  type SolutionAccessInput,
  type TimelineSession,
} from "@/lib/rooms/history";

const cell = (position: number, attempts: number, wrongBefore: number, solveSeconds: number | null) => ({
  position,
  attempts,
  wrongBefore,
  solveSeconds,
  firstAcceptedAt: solveSeconds === null ? null : new Date(Date.UTC(2026, 9, 24, 18, 0, 0) + solveSeconds * 1000),
  solvedBefore: false,
});

// §6.4 result rows.
const ALICE = [cell(1, 1, 0, 370), cell(2, 2, 1, 1470), cell(3, 1, 0, 3060), cell(4, 1, 1, null)];
const CAROL = [cell(1, 2, 1, 720), cell(2, 1, 0, 2100), cell(3, 1, 0, 5390)];
const BOB = [cell(1, 1, 0, 240), cell(2, 1, 1, null), cell(3, 1, 0, 2400)];

describe("query params", () => {
  it("parsePageParam: positive integers only, else 1", () => {
    expect(parsePageParam("3")).toBe(3);
    expect(parsePageParam(["2", "5"])).toBe(2);
    for (const bad of [undefined, "", "0", "-1", "2x", "1.5", "9999999", 7]) expect(parsePageParam(bad)).toBe(1);
  });

  it("parseLeaderboardRange: known values, default last 3 months", () => {
    expect(parseLeaderboardRange("4w")).toBe("4w");
    expect(parseLeaderboardRange("all")).toBe("all");
    expect(parseLeaderboardRange(undefined)).toBe("3m");
    expect(parseLeaderboardRange("year")).toBe("3m");
  });

  it("hrefs keep the tab; defaults are omitted", () => {
    expect(roomHistoryHref("r", 1)).toBe("/rooms/r");
    expect(roomHistoryHref("r", 2)).toBe("/rooms/r?page=2");
    expect(leaderboardHref("r", "3m")).toBe("/rooms/r?tab=leaderboard");
    expect(leaderboardHref("r", "all")).toBe("/rooms/r?tab=leaderboard&range=all");
  });
});

describe("penaltyBreakdown (D1)", () => {
  it("§6.4: alice 4900 + 300 = 5200, carol 8210 + 300 = 8510, bob 2640", () => {
    expect(penaltyBreakdown(ALICE)).toEqual({ solveSec: 4900, wrongCount: 1, penaltySec: 300, totalSec: 5200 });
    expect(penaltyBreakdown(CAROL)).toEqual({ solveSec: 8210, wrongCount: 1, penaltySec: 300, totalSec: 8510 });
    expect(penaltyBreakdown(BOB)).toEqual({ solveSec: 2640, wrongCount: 0, penaltySec: 0, totalSec: 2640 });
  });

  it("wrong attempts on unsolved problems add nothing", () => {
    expect(penaltyBreakdown([cell(1, 5, 5, null)])).toEqual({ solveSec: 0, wrongCount: 0, penaltySec: 0, totalSec: 0 });
  });
});

describe("cellSrText (§4.2)", () => {
  it("the spec's example and the other states", () => {
    expect(cellSrText(2, { attempts: 2, wrongBefore: 1, solveSeconds: 1421, solvedBefore: false }, true)).toBe(
      "Problem 2: solved at 23 minutes 41 seconds after 1 wrong attempt, first to solve",
    );
    expect(cellSrText(1, { attempts: 1, wrongBefore: 0, solveSeconds: 370, solvedBefore: true }, false)).toBe(
      "Problem 1: solved at 6 minutes 10 seconds, solved before the session",
    );
    expect(cellSrText(4, { attempts: 2, wrongBefore: 2, solveSeconds: null, solvedBefore: false }, false)).toBe(
      "Problem 4: not solved, 2 attempts",
    );
    expect(cellSrText(3, null, false)).toBe("Problem 3: not attempted");
  });

  it("spokenDuration", () => {
    expect(spokenDuration(0)).toBe("0 seconds");
    expect(spokenDuration(61)).toBe("1 minute 1 second");
    expect(spokenDuration(3600)).toBe("1 hour");
    expect(spokenDuration(5390)).toBe("1 hour 29 minutes 50 seconds");
  });
});

describe("solutionAccess (§4.5, D2)", () => {
  const base: SolutionAccessInput = {
    sessionStatus: "finished",
    roomShares: true,
    authorIsMember: true,
    authorShares: true,
    viewerIsAuthor: false,
    solved: true,
  };
  it("visible only for a finished, solved cell with both flags on and the author still a member", () => {
    expect(solutionAccess(base)).toEqual({ visible: true });
    expect(solutionAccess({ ...base, sessionStatus: "live" })).toEqual({ visible: false, reason: "not_finished" });
    expect(solutionAccess({ ...base, sessionStatus: "lobby" })).toEqual({ visible: false, reason: "not_finished" });
    expect(solutionAccess({ ...base, solved: false })).toEqual({ visible: false, reason: "unsolved" });
    expect(solutionAccess({ ...base, roomShares: false })).toEqual({ visible: false, reason: "room_off" });
    expect(solutionAccess({ ...base, authorIsMember: false, authorShares: false })).toEqual({ visible: false, reason: "author_left" });
    expect(solutionAccess({ ...base, authorShares: false })).toEqual({ visible: false, reason: "opted_out" });
  });

  it("authors always see their own code of a finished session, never while live", () => {
    const own = { ...base, viewerIsAuthor: true, roomShares: false, authorShares: false };
    expect(solutionAccess(own)).toEqual({ visible: true });
    expect(solutionAccess({ ...own, sessionStatus: "live" })).toEqual({ visible: false, reason: "not_finished" });
    expect(solutionAccess({ ...own, solved: false })).toEqual({ visible: false, reason: "unsolved" });
  });
});

describe("summarizeProblem", () => {
  const participants = (pos: number) => [
    { userId: "a", username: "alice", cell: ALICE.find((c) => c.position === pos) ?? null },
    { userId: "b", username: "bob", cell: BOB.find((c) => c.position === pos) ?? null },
    { userId: "c", username: "carol", cell: CAROL.find((c) => c.position === pos) ?? null },
  ];
  it("§6.4: solved-by counts and first solvers P1 bob, P2 alice, P3 bob, P4 none", () => {
    const s = [1, 2, 3, 4].map((position) => summarizeProblem({ position, participants: participants(position) }));
    expect(s.map((x) => [x.position, x.solvedBy, x.attemptedBy, x.participants, x.firstSolvers.map((f) => f.username)])).toEqual([
      [1, 3, 3, 3, ["bob"]],
      [2, 2, 3, 3, ["alice"]],
      [3, 3, 3, 3, ["bob"]],
      [4, 0, 1, 3, []],
    ]);
    expect(s[0].firstSolvers[0].solveSeconds).toBe(240);
  });

  it("equal timestamps → both are first", () => {
    const at = new Date("2026-10-24T18:10:00Z");
    const s = summarizeProblem({
      position: 1,
      participants: [
        { userId: "z", username: "zed", cell: { attempts: 1, solveSeconds: 600, firstAcceptedAt: at } },
        { userId: "y", username: "amy", cell: { attempts: 1, solveSeconds: 600, firstAcceptedAt: at } },
      ],
    });
    expect(s.firstSolvers.map((f) => f.username)).toEqual(["amy", "zed"]);
  });
});

describe("rankLeaderboard (§5.2)", () => {
  const row = (username: string, sessions: number, solved: number, offered: number, wins = 0, rankSum = 0, isMember = true): LeaderboardInput => ({
    userId: `id-${username}`,
    username,
    isMember,
    sessions,
    solved,
    offered,
    wins,
    rankSum,
    rankedSessions: sessions,
  });

  it("§6.4 single session: alice and carol tie on 3 solved and 75%; bob third", () => {
    const ranked = rankLeaderboard([row("bob", 1, 2, 4, 0, 3), row("carol", 1, 3, 4, 0, 2), row("alice", 1, 3, 4, 1, 1)]);
    expect(ranked.map((r) => [r.username, r.rank, r.solveRate, r.avgRank])).toEqual([
      ["alice", 1, 0.75, 1],
      ["carol", 1, 0.75, 2],
      ["bob", 3, 0.5, 3],
    ]);
  });

  it("solved first, then solve rate; members without sessions last and unranked", () => {
    const ranked = rankLeaderboard([
      row("dan", 0, 0, 0),
      row("ann", 3, 6, 12, 1, 6),
      row("ben", 2, 6, 8, 2, 3),
      row("cat", 4, 7, 16, 0, 10, false),
      row("abe", 0, 0, 0),
    ]);
    expect(ranked.map((r) => [r.username, r.rank])).toEqual([
      ["cat", 1],
      ["ben", 2],
      ["ann", 3],
      ["abe", null],
      ["dan", null],
    ]);
    expect(ranked.find((r) => r.username === "dan")).toMatchObject({ solveRate: null, avgRank: null });
    expect(ranked[0].isMember).toBe(false);
  });

  it("solveRate", () => {
    expect(solveRate(3, 4)).toBe(0.75);
    expect(solveRate(0, 0)).toBeNull();
  });
});

describe("timeline helpers", () => {
  const session = (id: string, day: number, rank: number | null, problems: [string, "easy" | "medium" | "hard", number | null, number][]): TimelineSession => ({
    sessionId: id,
    startedAt: new Date(Date.UTC(2026, 9, day, 18)),
    rank,
    participants: 3,
    solvedCount: problems.filter((p) => p[2] !== null).length,
    problems: problems.map(([title, difficulty, solveSeconds, wrongBefore], i) => ({
      position: i + 1,
      title,
      slug: title.toLowerCase().replace(/ /g, "-"),
      difficulty,
      solveSeconds,
      wrongBefore,
      attempts: wrongBefore + (solveSeconds === null ? 0 : 1),
    })),
  });
  const sample = session("s1", 24, 1, [
    ["Valid Anagram", "easy", 370, 0],
    ["House Robber", "medium", 1470, 1],
    ["Coin Change", "medium", 3060, 0],
    ["Edit Distance", "hard", null, 1],
  ]);

  it("solvedProblemLabel: the spec's §5.2 wording", () => {
    expect(sample.problems.filter((p) => p.solveSeconds !== null).map(solvedProblemLabel)).toEqual([
      "Valid Anagram (6:10)",
      "House Robber (24:30, 1 wrong)",
      "Coin Change (51:00)",
    ]);
  });

  it("timelineTotals per difficulty", () => {
    const earlier = session("s0", 17, 2, [["Two Sum", "easy", 100, 0], ["Hard One", "hard", 4000, 2]]);
    expect(timelineTotals([sample, earlier])).toEqual({
      sessions: 2,
      solved: 5,
      offered: 6,
      wins: 1,
      byDifficulty: {
        easy: { solved: 2, offered: 2 },
        medium: { solved: 2, offered: 2 },
        hard: { solved: 1, offered: 2 },
      },
    });
  });

  it("progressSeries is oldest first", () => {
    const earlier = session("s0", 17, 2, [["Two Sum", "easy", 100, 0]]);
    expect(progressSeries([sample, earlier]).map((p) => [p.sessionId, p.solved, p.offered])).toEqual([
      ["s0", 1, 1],
      ["s1", 3, 4],
    ]);
  });

  it("sessionRunMinutes: actual run time, capped at the planned duration", () => {
    const startedAt = new Date("2026-10-24T18:00:00Z");
    expect(sessionRunMinutes({ startedAt, endedAt: new Date("2026-10-24T18:52:10Z"), durationMin: 90 })).toBe(52);
    expect(sessionRunMinutes({ startedAt, endedAt: new Date("2026-10-24T19:30:00Z"), durationMin: 90 })).toBe(90);
    expect(sessionRunMinutes({ startedAt: null, endedAt: null, durationMin: 60 })).toBe(60);
  });
});
