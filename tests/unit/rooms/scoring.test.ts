import { describe, expect, it } from "vitest";

import {
  computeCellOutcome,
  formatScoreTime,
  isCountedStatus,
  rankParticipants,
  scoreSession,
  type ScoringSubmission,
} from "@/lib/rooms/scoring";
import { computeCalibration } from "@/lib/rooms/selection";

// Spec §6.4: session s1, 2026-10-24 18:00:00Z, 90 min.
const STARTED = new Date("2026-10-24T18:00:00Z");
const ENDS = new Date("2026-10-24T19:30:00Z");
const at = (hms: string) => new Date(`2026-10-24T${hms}Z`);

const SUBMISSIONS: { user: string; position: number; created: string; status: string }[] = [
  { user: "bob", position: 1, created: "18:04:00", status: "accepted" },
  { user: "alice", position: 1, created: "18:06:10", status: "accepted" },
  { user: "carol", position: 1, created: "18:08:00", status: "wrong_answer" },
  { user: "carol", position: 1, created: "18:12:00", status: "accepted" },
  { user: "alice", position: 2, created: "18:20:00", status: "wrong_answer" },
  { user: "alice", position: 2, created: "18:24:30", status: "accepted" },
  { user: "carol", position: 2, created: "18:35:00", status: "accepted" },
  { user: "bob", position: 3, created: "18:40:00", status: "accepted" },
  { user: "bob", position: 2, created: "18:45:00", status: "compile_error" },
  { user: "bob", position: 2, created: "18:50:00", status: "wrong_answer" },
  { user: "alice", position: 3, created: "18:51:00", status: "accepted" },
  { user: "alice", position: 4, created: "19:10:00", status: "time_limit" },
  { user: "carol", position: 3, created: "19:29:50", status: "accepted" },
];

function cellsFor(user: string) {
  const positions = [...new Set(SUBMISSIONS.filter((s) => s.user === user).map((s) => s.position))].sort();
  return positions.map((position) => {
    const subs: ScoringSubmission[] = SUBMISSIONS.filter((s) => s.user === user && s.position === position).map(
      (s, i) => ({ id: `${user}-${position}-${i}`, status: s.status, createdAt: at(s.created) }),
    );
    return { position, ...computeCellOutcome(subs, { startedAt: STARTED, endsAt: ENDS }) };
  });
}

const cell = (attempts: number, wrongBefore: number, solveSeconds: number | null) => ({
  attempts,
  wrongBefore,
  solveSeconds,
});

describe("§6.4 sample session", () => {
  it("per-cell results match the spec table (attempts / wrong before / solve seconds)", () => {
    const pick = (user: string) =>
      Object.fromEntries(cellsFor(user).map((c) => [c.position, cell(c.attempts, c.wrongBefore, c.solveSeconds)]));
    expect(pick("alice")).toEqual({ 1: cell(1, 0, 370), 2: cell(2, 1, 1470), 3: cell(1, 0, 3060), 4: cell(1, 1, null) });
    expect(pick("bob")).toEqual({ 1: cell(1, 0, 240), 2: cell(1, 1, null), 3: cell(1, 0, 2400) });
    expect(pick("carol")).toEqual({ 1: cell(2, 1, 720), 2: cell(1, 0, 2100), 3: cell(1, 0, 5390) });
  });

  it("ranks alice 1, carol 2, bob 3 with penalties 5200 / 8510 / 2640", () => {
    const score = scoreSession(
      ["alice", "bob", "carol"].map((u) => ({ userId: u, username: u, cells: cellsFor(u) })),
    );
    expect(score.participants).toEqual([
      { userId: "alice", username: "alice", solvedCount: 3, penaltySec: 5200, rank: 1 },
      { userId: "carol", username: "carol", solvedCount: 3, penaltySec: 8510, rank: 2 },
      { userId: "bob", username: "bob", solvedCount: 2, penaltySec: 2640, rank: 3 },
    ]);
    expect(score.participants.map((p) => formatScoreTime(p.penaltySec))).toEqual(["1:26:40", "2:21:50", "44:00"]);
    expect(Object.fromEntries(score.firstSolvers)).toEqual({ 1: ["bob"], 2: ["alice"], 3: ["bob"] });
  });

  it("calibration contribution: easy 3/3, medium 5/6, hard 0/3", () => {
    const difficulty = { 1: "easy", 2: "medium", 3: "medium", 4: "hard" } as const;
    const calibration = computeCalibration([
      {
        problems: [1, 2, 3, 4].map((position) => ({ position, difficulty: difficulty[position as 1 | 2 | 3 | 4] })),
        results: ["alice", "bob", "carol"].flatMap((u) =>
          cellsFor(u).map((c) => ({ userId: u, position: c.position, attempts: c.attempts, solved: c.solveSeconds !== null })),
        ),
      },
    ]);
    expect(calibration.counts).toEqual({
      easy: { solved: 3, pairs: 3 },
      medium: { solved: 5, pairs: 6 },
      hard: { solved: 0, pairs: 3 },
    });
  });
});

describe("computeCellOutcome", () => {
  const w = { startedAt: STARTED, endsAt: ENDS };

  it("ignores compile and internal errors and submits outside [started, ends)", () => {
    const r = computeCellOutcome(
      [
        { id: "a", status: "compile_error", createdAt: at("18:01:00") },
        { id: "b", status: "internal_error", createdAt: at("18:02:00") },
        { id: "c", status: "accepted", createdAt: at("17:59:59") },
        { id: "d", status: "accepted", createdAt: ENDS },
        { id: "e", status: "queued", createdAt: at("18:03:00") },
      ],
      w,
    );
    expect(r).toEqual({ attempts: 0, wrongBefore: 0, firstAcceptedAt: null, firstAcceptedSubmissionId: null, solveSeconds: null });
  });

  it("wrong attempts after the first accept are ignored for score but count as attempts", () => {
    const r = computeCellOutcome(
      [
        { id: "a", status: "runtime_error", createdAt: at("18:00:10") },
        { id: "b", status: "accepted", createdAt: at("18:01:00.900") },
        { id: "c", status: "wrong_answer", createdAt: at("18:02:00") },
        { id: "d", status: "accepted", createdAt: at("18:03:00") },
      ],
      w,
    );
    expect(r).toMatchObject({ attempts: 4, wrongBefore: 1, firstAcceptedSubmissionId: "b", solveSeconds: 60 });
  });

  it("orders by created_at, then id (out-of-order input)", () => {
    const r = computeCellOutcome(
      [
        { id: "z", status: "accepted", createdAt: at("18:05:00") },
        { id: "y", status: "accepted", createdAt: at("18:05:00") },
        { id: "x", status: "memory_limit", createdAt: at("18:04:00") },
      ],
      w,
    );
    expect(r).toMatchObject({ firstAcceptedSubmissionId: "y", wrongBefore: 1, attempts: 3 });
  });

  it("knows which statuses count", () => {
    expect(["accepted", "wrong_answer", "time_limit", "memory_limit", "runtime_error"].every(isCountedStatus)).toBe(true);
    expect(["compile_error", "internal_error", "queued", "running"].some(isCountedStatus)).toBe(false);
  });
});

describe("ranking", () => {
  it("ties share a rank (1, 1, 3) and are listed by username", () => {
    const ranked = rankParticipants([
      { userId: "3", username: "zed", solvedCount: 2, penaltySec: 100 },
      { userId: "1", username: "bob", solvedCount: 2, penaltySec: 100 },
      { userId: "2", username: "amy", solvedCount: 1, penaltySec: 10 },
      { userId: "4", username: "cat", solvedCount: 0, penaltySec: 0 },
    ]);
    expect(ranked.map((r) => [r.username, r.rank])).toEqual([
      ["bob", 1],
      ["zed", 1],
      ["amy", 3],
      ["cat", 4],
    ]);
  });

  it("participants without submits get a rank; equal first-accept timestamps share First", () => {
    const score = scoreSession([
      { userId: "a", username: "a", cells: [{ position: 1, wrongBefore: 0, solveSeconds: 60, firstAcceptedAt: at("18:01:00") }] },
      { userId: "b", username: "b", cells: [{ position: 1, wrongBefore: 0, solveSeconds: 60, firstAcceptedAt: at("18:01:00") }] },
      { userId: "c", username: "c", cells: [] },
    ]);
    expect(score.participants.map((p) => p.rank)).toEqual([1, 1, 3]);
    expect(score.firstSolvers.get(1)).toEqual(["a", "b"]);
  });

  it("formats times as m:ss or h:mm:ss", () => {
    expect(formatScoreTime(0)).toBe("0:00");
    expect(formatScoreTime(59)).toBe("0:59");
    expect(formatScoreTime(370)).toBe("6:10");
    expect(formatScoreTime(1421)).toBe("23:41");
    expect(formatScoreTime(3599)).toBe("59:59");
    expect(formatScoreTime(3600)).toBe("1:00:00");
    expect(formatScoreTime(5200)).toBe("1:26:40");
  });
});
