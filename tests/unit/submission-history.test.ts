// History URL state and date formatting (AC-M6-1).
import { describe, expect, it } from "vitest";

import { formatDateTime, formatRelativeTime, formatShortDate } from "@/lib/format";
import {
  isValidSlug,
  parseHistoryParams,
  shortId,
  submissionsHref,
} from "@/lib/submissions/history";

describe("parseHistoryParams", () => {
  it("defaults to page 1 without a filter", () => {
    expect(parseHistoryParams({})).toEqual({ page: 1 });
  });

  it("reads page and problem", () => {
    expect(parseHistoryParams({ page: "3", problem: "two-sum" })).toEqual({ page: 3, problem: "two-sum" });
  });

  it.each(["0", "-1", "abc", "1.5", "9999999", "", " 2"])("falls back to page 1 for %j", (page) => {
    expect(parseHistoryParams({ page }).page).toBe(1);
  });

  it("takes the first of repeated params", () => {
    expect(parseHistoryParams({ page: ["2", "5"], problem: ["a", "b"] })).toEqual({ page: 2, problem: "a" });
  });

  it("keeps a malformed slug (the page shows an empty state) but caps its length", () => {
    expect(parseHistoryParams({ problem: "Not A Slug" }).problem).toBe("Not A Slug");
    expect(parseHistoryParams({ problem: "x".repeat(500) }).problem).toHaveLength(101);
    expect(parseHistoryParams({ problem: "   " })).toEqual({ page: 1 });
  });
});

describe("isValidSlug", () => {
  it("accepts importer slugs only", () => {
    expect(isValidSlug("two-sum")).toBe(true);
    expect(isValidSlug("3sum")).toBe(true);
    for (const bad of ["Two-Sum", "two_sum", "-a", "a-", "a--b", "a b", "a/../b", "", "x".repeat(101)]) {
      expect(isValidSlug(bad)).toBe(false);
    }
  });
});

describe("submissionsHref", () => {
  it("leaves defaults out of the URL", () => {
    expect(submissionsHref()).toBe("/submissions");
    expect(submissionsHref({ page: 1 })).toBe("/submissions");
    expect(submissionsHref({ page: 2 })).toBe("/submissions?page=2");
    expect(submissionsHref({ problem: "two-sum" })).toBe("/submissions?problem=two-sum");
    expect(submissionsHref({ page: 3, problem: "two-sum" })).toBe("/submissions?problem=two-sum&page=3");
  });

  it("encodes the slug", () => {
    expect(submissionsHref({ problem: "a b&c" })).toBe("/submissions?problem=a+b%26c");
  });
});

describe("shortId", () => {
  it("is the first 8 hex digits", () => {
    expect(shortId("a1b2c3d4-e5f6-4000-8000-000000000000")).toBe("a1b2c3d4");
  });
});

describe("date formatting", () => {
  const now = new Date("2026-10-17T14:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms);

  it("formats relative times", () => {
    expect(formatRelativeTime(ago(10_000), now)).toBe("just now");
    expect(formatRelativeTime(ago(3 * 60_000), now)).toBe("3 min ago");
    expect(formatRelativeTime(ago(59 * 60_000), now)).toBe("59 min ago");
    expect(formatRelativeTime(ago(5 * 3_600_000), now)).toBe("5 h ago");
    expect(formatRelativeTime(ago(30 * 3_600_000), now)).toBe("yesterday");
    expect(formatRelativeTime(ago(4 * 86_400_000), now)).toBe("4 days ago");
  });

  it("falls back to the date for old and future times", () => {
    expect(formatRelativeTime(ago(40 * 86_400_000), now)).toBe("Sep 7, 2026");
    expect(formatRelativeTime(new Date(now.getTime() + 5 * 60_000), now)).toBe("Oct 17, 2026");
    // Small clock skew still reads as "just now".
    expect(formatRelativeTime(new Date(now.getTime() + 20_000), now)).toBe("just now");
  });

  it("formats absolute dates in UTC", () => {
    expect(formatShortDate(now)).toBe("Oct 17, 2026");
    expect(formatDateTime(new Date("2026-10-17T04:05:00Z"))).toBe("Oct 17, 2026, 04:05 UTC");
    expect(formatDateTime(new Date("2026-12-31T23:59:00Z"))).toBe("Dec 31, 2026, 23:59 UTC");
  });
});
