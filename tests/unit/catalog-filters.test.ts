import { describe, expect, it } from "vitest";

import {
  catalogHref,
  effectiveFilters,
  escapeLike,
  hasActiveFilters,
  parseCatalogFilters,
} from "@/lib/catalog/filters";

describe("parseCatalogFilters (AC-M3-1, AC-M3-2)", () => {
  it("defaults to page 1 with no filters", () => {
    expect(parseCatalogFilters({})).toEqual({ page: 1 });
  });

  it("reads every filter", () => {
    expect(
      parseCatalogFilters({ q: "two sum", difficulty: "easy", tag: "hash-table", status: "solved", page: "3" }),
    ).toEqual({ q: "two sum", difficulty: "easy", tag: "hash-table", status: "solved", page: 3 });
  });

  it("accepts URLSearchParams", () => {
    expect(parseCatalogFilters(new URLSearchParams("difficulty=hard&page=2"))).toEqual({
      difficulty: "hard",
      page: 2,
    });
  });

  it("normalizes the search query and drops blank ones", () => {
    expect(parseCatalogFilters({ q: "  Two   Sum " }).q).toBe("Two Sum");
    expect(parseCatalogFilters({ q: "   " }).q).toBeUndefined();
    expect(parseCatalogFilters({ q: "x".repeat(500) }).q).toHaveLength(100);
  });

  it("uses the first value of a repeated param", () => {
    expect(parseCatalogFilters({ difficulty: ["medium", "hard"] }).difficulty).toBe("medium");
  });

  it.each([
    ["difficulty", "impossible"],
    ["difficulty", "EASY"],
    ["status", "done"],
    ["tag", "Hash Table"],
    ["tag", "../etc"],
    ["tag", "a".repeat(65)],
  ])("ignores an invalid %s=%s instead of failing", (key, value) => {
    expect(parseCatalogFilters({ [key]: value })).toEqual({ page: 1 });
  });

  it.each(["0", "-1", "1.5", "abc", "1e3", "9999999", ""])("falls back to page 1 for page=%s", (page) => {
    expect(parseCatalogFilters({ page }).page).toBe(1);
  });
});

describe("effectiveFilters", () => {
  it("drops the status filter for guests (AC-M3-2)", () => {
    const f = parseCatalogFilters({ status: "solved", difficulty: "easy" });
    expect(effectiveFilters(f, false)).toEqual({ difficulty: "easy", page: 1 });
    expect(effectiveFilters(f, true)).toEqual(f);
  });

  it("hasActiveFilters ignores the page", () => {
    expect(hasActiveFilters({ page: 4 })).toBe(false);
    expect(hasActiveFilters({ page: 1, tag: "array" })).toBe(true);
  });
});

describe("catalogHref", () => {
  it("leaves defaults out of the URL", () => {
    expect(catalogHref({ page: 1 })).toBe("/problems");
  });

  it("keeps filters when changing the page", () => {
    expect(catalogHref({ page: 1, difficulty: "easy", q: "sum" }, { page: 2 })).toBe(
      "/problems?q=sum&difficulty=easy&page=2",
    );
  });

  it("resets the page when a filter changes", () => {
    expect(catalogHref({ page: 3, difficulty: "easy" }, { tag: "array" })).toBe(
      "/problems?difficulty=easy&tag=array",
    );
  });

  it("removes a filter set to undefined", () => {
    expect(catalogHref({ page: 2, difficulty: "easy", tag: "array" }, { difficulty: undefined })).toBe(
      "/problems?tag=array",
    );
  });

  it("encodes the query", () => {
    expect(catalogHref({ page: 1 }, { q: "a&b=c" })).toBe("/problems?q=a%26b%3Dc");
  });

  it("round-trips through the parser", () => {
    const f = { page: 2, q: "x y", difficulty: "hard", tag: "two-pointers", status: "todo" } as const;
    const url = new URL(catalogHref(f), "http://localhost");
    expect(parseCatalogFilters(url.searchParams)).toEqual(f);
  });
});

describe("escapeLike", () => {
  it("escapes LIKE wildcards and the escape character", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });
});
