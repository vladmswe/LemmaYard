// Study plans (AC-C-SP-3): per-viewer progress. Our problems follow the
// catalog rule (accepted submit = solved, any submit = attempted), external
// items follow the viewer's tick, unpublished problems count nowhere.
import { describe, expect, it } from "vitest";

import { isDone, problemState, summarizeProgress, type ProgressItem } from "@/lib/plans/progress";

const solved = { solved: true, firstSolvedAt: new Date("2026-10-16T10:00:00Z"), wrongCount: 1 };
const attempted = { solved: false, firstSolvedAt: null, wrongCount: 2 };

describe("problemState", () => {
  it("solved > attempted > not started", () => {
    expect(problemState(solved, true)).toEqual({ kind: "problem", status: "solved", solvedAt: solved.firstSolvedAt, wrongCount: 1 });
    expect(problemState(attempted, true)).toEqual({ kind: "problem", status: "attempted", solvedAt: null, wrongCount: 2 });
    expect(problemState(undefined, true)).toEqual({ kind: "problem", status: "todo", solvedAt: null, wrongCount: 0 });
  });

  it("an unpublished problem is unavailable whatever the submits", () => {
    expect(problemState(solved, false)).toEqual({ kind: "unavailable" });
  });

  it("isDone: solved problems and ticked external items", () => {
    expect(isDone(problemState(solved, true))).toBe(true);
    expect(isDone(problemState(attempted, true))).toBe(false);
    expect(isDone({ kind: "external", done: true })).toBe(true);
    expect(isDone({ kind: "external", done: false })).toBe(false);
    expect(isDone({ kind: "unavailable" })).toBe(false);
  });
});

describe("summarizeProgress", () => {
  const items: ProgressItem[] = [
    { id: "1", difficulty: "medium", state: problemState(solved, true) },
    { id: "2", difficulty: "medium", state: problemState(attempted, true) },
    { id: "3", difficulty: "easy", state: problemState(solved, true) },
    { id: "4", difficulty: null, state: { kind: "external", done: false } },
    { id: "5", difficulty: "hard", state: problemState(undefined, true) },
    { id: "6", difficulty: "hard", state: { kind: "unavailable" } },
    { id: "7", difficulty: null, state: { kind: "external", done: true } },
  ];

  it("counts done / total per difficulty and for external items", () => {
    const p = summarizeProgress(items);
    expect(p.done).toBe(3);
    expect(p.total).toBe(6); // the unavailable item is not counted
    expect(p.byDifficulty).toEqual({ easy: { done: 1, total: 1 }, medium: { done: 1, total: 2 }, hard: { done: 0, total: 1 } });
    expect(p.external).toEqual({ done: 1, total: 2 });
  });

  it("next = the first item in plan order that is not done", () => {
    expect(summarizeProgress(items).nextItemId).toBe("2");
    expect(summarizeProgress(items.slice(0, 1)).nextItemId).toBeNull();
    expect(summarizeProgress([{ id: "u", difficulty: "easy", state: { kind: "unavailable" } }]).nextItemId).toBeNull();
  });

  it("an empty plan is 0 of 0", () => {
    expect(summarizeProgress([])).toMatchObject({ done: 0, total: 0, nextItemId: null });
  });
});
