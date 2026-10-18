// Vote math (docs/specs/community.md §B.4; AC-C-VT-3/4/5): Wilson lower bound,
// vote deltas, "% liked", the difficulty-feedback summary.
import { describe, expect, it } from "vitest";

import {
  feedbackSentence,
  feedbackSummary,
  likePercent,
  netScore,
  voteDelta,
  wilsonLowerBound,
  wilsonSql,
} from "@/lib/community/ranking";

describe("wilsonLowerBound (AC-C-VT-3)", () => {
  it("matches known values", () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
    expect(wilsonLowerBound(1, 0)).toBeCloseTo(0.2065, 4);
    expect(wilsonLowerBound(0, 1)).toBeCloseTo(0, 12);
    expect(wilsonLowerBound(5, 5)).toBeCloseTo(0.2366, 4);
    expect(wilsonLowerBound(100, 1)).toBeCloseTo(0.946, 3);
    expect(wilsonLowerBound(1000, 10)).toBeCloseTo(0.9819, 3);
  });

  it("stays in [0, 1) and ranks with the evidence", () => {
    const cases: [number, number][] = [[0, 0], [1, 0], [0, 1], [5, 5], [100, 1], [1000, 10], [3, 0], [30, 0]];
    for (const [u, d] of cases) {
      const w = wilsonLowerBound(u, d);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThan(1);
    }
    // More votes at the same ratio rank higher; a single upvote does not beat many.
    expect(wilsonLowerBound(30, 0)).toBeGreaterThan(wilsonLowerBound(3, 0));
    expect(wilsonLowerBound(1000, 10)).toBeGreaterThan(wilsonLowerBound(100, 1));
    expect(wilsonLowerBound(100, 1)).toBeGreaterThan(wilsonLowerBound(1, 0));
    expect(wilsonLowerBound(5, 5)).toBeGreaterThan(wilsonLowerBound(0, 1));
  });

  it("has an SQL twin over the given column names", () => {
    const text = wilsonSql("up_x", "down_y");
    expect(text).toContain("up_x");
    expect(text).toContain("down_y");
  });
});

describe("voteDelta", () => {
  it.each([
    [0, 0, 0, 0],
    [0, 1, 1, 0],
    [0, -1, 0, 1],
    [1, 0, -1, 0],
    [1, 1, 0, 0],
    [1, -1, -1, 1],
    [-1, 0, 0, -1],
    [-1, 1, 1, -1],
    [-1, -1, 0, 0],
  ] as const)("%i → %i: up %i, down %i", (prev, next, up, down) => {
    expect(voteDelta(prev, next)).toEqual({ up, down });
  });

  it("net score is up − down", () => {
    expect(netScore(25, 3)).toBe(22);
  });
});

describe("likePercent (AC-C-VT-4)", () => {
  it("is hidden below the threshold", () => {
    expect(likePercent(0, 0, 10)).toBeNull();
    expect(likePercent(9, 0, 10)).toBeNull();
    expect(likePercent(5, 4, 10)).toBeNull();
  });

  it("is an integer percent from the threshold on", () => {
    expect(likePercent(10, 0, 10)).toBe(100);
    expect(likePercent(0, 10, 10)).toBe(0);
    expect(likePercent(128, 8, 10)).toBe(94);
    expect(likePercent(9, 1, 10)).toBe(90);
    // Rounding half up: 2/3 → 66.67 → 67; 1/8 → 12.5 → 13.
    expect(likePercent(20, 10, 10)).toBe(67);
    expect(likePercent(2, 14, 10)).toBe(13);
  });
});

describe("feedbackSummary (AC-C-VT-5)", () => {
  it("shows no verdict below the threshold", () => {
    expect(feedbackSummary({ easier: 0, right: 0, harder: 9 }, 10)).toEqual({ total: 9, verdict: null });
    expect(feedbackSummary({ easier: 0, right: 0, harder: 0 }, 10)).toEqual({ total: 0, verdict: null });
  });

  it("picks the most common answer; ties prefer right, then harder", () => {
    expect(feedbackSummary({ easier: 2, right: 3, harder: 18 }, 10)).toEqual({ total: 23, verdict: "harder" });
    expect(feedbackSummary({ easier: 6, right: 2, harder: 2 }, 10).verdict).toBe("easier");
    expect(feedbackSummary({ easier: 5, right: 5, harder: 5 }, 10).verdict).toBe("right");
    expect(feedbackSummary({ easier: 5, right: 0, harder: 5 }, 10).verdict).toBe("harder");
  });

  it("phrases the verdict", () => {
    expect(feedbackSentence("harder")).toBe("Most solvers found it harder than its rating");
    expect(feedbackSentence("easier")).toBe("Most solvers found it easier than its rating");
    expect(feedbackSentence("right")).toBe("Most solvers found its rating about right");
  });
});
