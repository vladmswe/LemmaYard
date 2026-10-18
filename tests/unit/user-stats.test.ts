// Counting rules of the profile / landing statistics (AC-M6-4, AC-M6-5).
import { describe, expect, it } from "vitest";

import { isCountedStatus, summarizeProfileExtras, summarizeUserStats, type SubmissionGroup } from "@/lib/progress";

const day = (n: number) => new Date(Date.UTC(2026, 9, n, 12));

let seq = 0;
function group(overrides: Partial<SubmissionGroup>): SubmissionGroup {
  const id = overrides.problemId ?? `p${++seq}`;
  return {
    problemId: id,
    slug: overrides.slug ?? id,
    title: overrides.title ?? `Problem ${id}`,
    difficulty: "easy",
    published: true,
    kind: "submit",
    status: "accepted",
    count: 1,
    firstAt: day(1),
    ...overrides,
  };
}

describe("summarizeUserStats", () => {
  it("is all zeros with acceptance null (shown as —) without submissions", () => {
    expect(summarizeUserStats([])).toEqual({
      solved: { easy: 0, medium: 0, hard: 0 },
      solvedTotal: 0,
      submits: 0,
      acceptance: null,
      recentSolved: [],
    });
  });

  it("counts a problem once however many accepted submits it has", () => {
    const stats = summarizeUserStats([
      group({ problemId: "a", status: "accepted", count: 5 }),
      group({ problemId: "a", status: "wrong_answer", count: 3 }),
    ]);
    expect(stats.solved).toEqual({ easy: 1, medium: 0, hard: 0 });
    expect(stats.solvedTotal).toBe(1);
    expect(stats.submits).toBe(8);
    expect(stats.acceptance).toBeCloseTo(5 / 8);
    expect(stats.recentSolved.map((p) => p.slug)).toEqual(["a"]);
  });

  it("ignores runs entirely (solved, submits, acceptance)", () => {
    const stats = summarizeUserStats([
      group({ problemId: "a", kind: "run", status: "accepted", count: 4 }),
      group({ problemId: "b", kind: "run", status: "wrong_answer", count: 2 }),
      group({ problemId: "b", kind: "submit", status: "wrong_answer", count: 1 }),
    ]);
    expect(stats.solvedTotal).toBe(0);
    expect(stats.submits).toBe(1);
    expect(stats.acceptance).toBe(0);
    expect(stats.recentSolved).toEqual([]);
  });

  it("leaves internal errors and pending jobs out of acceptance and the submission count", () => {
    const stats = summarizeUserStats([
      group({ problemId: "a", status: "accepted", count: 1 }),
      group({ problemId: "a", status: "internal_error", count: 7 }),
      group({ problemId: "b", status: "queued", count: 1 }),
      group({ problemId: "b", status: "running", count: 1 }),
      group({ problemId: "b", status: "time_limit", count: 1 }),
    ]);
    expect(stats.submits).toBe(2);
    expect(stats.acceptance).toBe(0.5);
  });

  it("only internal errors: no counted submits, acceptance null", () => {
    const stats = summarizeUserStats([group({ status: "internal_error", count: 3 })]);
    expect(stats.submits).toBe(0);
    expect(stats.acceptance).toBeNull();
  });

  it("ignores unpublished problems in solved, submits and recently solved", () => {
    const stats = summarizeUserStats([
      group({ problemId: "hidden", published: false, status: "accepted", count: 2, difficulty: "hard" }),
      group({ problemId: "hidden", published: false, status: "wrong_answer", count: 2, difficulty: "hard" }),
      group({ problemId: "open", status: "accepted", difficulty: "medium" }),
    ]);
    expect(stats.solved).toEqual({ easy: 0, medium: 1, hard: 0 });
    expect(stats.submits).toBe(1);
    expect(stats.acceptance).toBe(1);
    expect(stats.recentSolved.map((p) => p.slug)).toEqual(["open"]);
  });

  it("splits solved by difficulty", () => {
    const stats = summarizeUserStats([
      group({ difficulty: "easy" }),
      group({ difficulty: "easy" }),
      group({ difficulty: "medium" }),
      group({ difficulty: "hard" }),
      group({ difficulty: "hard", status: "wrong_answer" }),
    ]);
    expect(stats.solved).toEqual({ easy: 2, medium: 1, hard: 1 });
    expect(stats.solvedTotal).toBe(4);
  });

  it("lists recently solved by first accepted, newest first, unique, capped at 10", () => {
    const groups = Array.from({ length: 12 }, (_, i) =>
      group({ problemId: `q${i}`, slug: `q${i}`, firstAt: day(i + 1), count: 2 }),
    );
    const stats = summarizeUserStats(groups);
    expect(stats.recentSolved).toHaveLength(10);
    expect(stats.recentSolved.map((p) => p.slug)).toEqual(
      Array.from({ length: 10 }, (_, i) => `q${11 - i}`),
    );
    expect(stats.recentSolved[0].firstAcceptedAt).toEqual(day(12));
    expect(summarizeUserStats(groups, 3).recentSolved).toHaveLength(3);
  });

  it("dates a solved problem by its earliest accepted group, not a later attempt", () => {
    const stats = summarizeUserStats([
      group({ problemId: "a", status: "wrong_answer", firstAt: day(1) }),
      group({ problemId: "a", status: "accepted", firstAt: day(5) }),
      group({ problemId: "a", status: "accepted", firstAt: day(3) }),
    ]);
    expect(stats.solvedTotal).toBe(1);
    expect(stats.recentSolved).toEqual([
      { slug: "a", title: "Problem a", difficulty: "easy", firstAcceptedAt: day(3) },
    ]);
  });

  it("isCountedStatus matches PLAN §4", () => {
    expect(isCountedStatus("accepted")).toBe(true);
    expect(isCountedStatus("wrong_answer")).toBe(true);
    expect(isCountedStatus("compile_error")).toBe(true);
    expect(isCountedStatus("internal_error")).toBe(false);
    expect(isCountedStatus("queued")).toBe(false);
    expect(isCountedStatus("running")).toBe(false);
  });
});

describe("summarizeProfileExtras (profile proof sheet)", () => {
  it("counts attempted problems once, never solved ones, and only counted submits", () => {
    const extras = summarizeProfileExtras([
      group({ problemId: "a", status: "wrong_answer", difficulty: "medium" }),
      group({ problemId: "a", status: "time_limit", difficulty: "medium" }),
      group({ problemId: "b", status: "wrong_answer" }),
      group({ problemId: "b", status: "accepted" }),
      group({ problemId: "c", status: "internal_error", difficulty: "hard" }),
      group({ problemId: "d", status: "wrong_answer", kind: "run", difficulty: "hard" }),
      group({ problemId: "e", status: "wrong_answer", published: false, difficulty: "hard" }),
    ]);
    expect(extras.attempted).toEqual({ easy: 0, medium: 1, hard: 0 });
  });

  it("keeps the language of the first accepted submit and picks the main language", () => {
    const extras = summarizeProfileExtras([
      group({ problemId: "a", slug: "a", language: "javascript", firstAt: day(5), count: 1 }),
      group({ problemId: "a", slug: "a", language: "python", firstAt: day(2), count: 1 }),
      group({ problemId: "b", slug: "b", language: "javascript", status: "wrong_answer", count: 4 }),
      group({ problemId: "c", slug: "c", language: "python", status: "internal_error", count: 9 }),
    ]);
    expect(extras.solvedLanguage).toEqual({ a: "python" });
    expect(extras.mainLanguage).toBe("javascript");
    expect(summarizeProfileExtras([]).mainLanguage).toBeNull();
  });
});
