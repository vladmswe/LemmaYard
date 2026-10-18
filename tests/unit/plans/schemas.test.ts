// Study plans (AC-C-SP-1): request bodies and text rules (plain text only),
// the PLANS_ENABLED switch and the nav item it controls.
import { describe, expect, it } from "vitest";

import { visibleNavLinks } from "@/components/nav-links";
import {
  addItemsBodySchema,
  createPlanWithItemsBodySchema,
  layoutBodySchema,
  MAX_ITEMS_PER_BATCH,
  parseDiscoverParams,
  planDescriptionSchema,
  planTitleSchema,
  sectionTitleSchema,
  tickBodySchema,
  updatePlanBodySchema,
} from "@/lib/plans/schemas";
import { envSchema, parseEnv } from "@/server/env";

const BASE_ENV = { DATABASE_URL: "postgres://u:p@localhost:5432/db", AUTH_SECRET: "x".repeat(40) };

describe("text fields", () => {
  it("titles: trimmed, inner spaces collapsed, 1–80 code points", () => {
    expect(planTitleSchema.parse("  Fall   interview prep ")).toBe("Fall interview prep");
    expect(planTitleSchema.safeParse("   ").success).toBe(false);
    expect(planTitleSchema.safeParse("x".repeat(80)).success).toBe(true);
    expect(planTitleSchema.safeParse("x".repeat(81)).success).toBe(false);
    // 80 astral characters are 160 UTF-16 units but 80 code points (Postgres char_length).
    expect(planTitleSchema.safeParse("😀".repeat(80)).success).toBe(true);
  });

  it.each(["a\u0000b", "a\nb", "a\u0007b", "a‮b", "a⁦b"])("titles reject controls and bidi overrides (%j)", (bad) => {
    expect(planTitleSchema.safeParse(bad).success).toBe(false);
    expect(sectionTitleSchema.safeParse(bad).success).toBe(false);
  });

  it("descriptions keep newlines (CRLF → LF), reject other controls, ≤ 2000", () => {
    expect(planDescriptionSchema.parse("line 1\r\nline 2\n\nline 3")).toBe("line 1\nline 2\n\nline 3");
    expect(planDescriptionSchema.safeParse("tab\there").success).toBe(false);
    expect(planDescriptionSchema.safeParse("nul\u0000").success).toBe(false);
    expect(planDescriptionSchema.safeParse("a\n\n\n\nb").success).toBe(false);
    expect(planDescriptionSchema.safeParse("x".repeat(2001)).success).toBe(false);
    // Markup is just text: it is stored as typed and rendered as text, never as HTML.
    expect(planDescriptionSchema.parse("<img src=x onerror=alert(1)> **bold**")).toBe("<img src=x onerror=alert(1)> **bold**");
  });
});

describe("bodies", () => {
  it("are strict (unknown keys → invalid)", () => {
    expect(createPlanWithItemsBodySchema.safeParse({ title: "P", ownerId: "x" }).success).toBe(false);
    expect(tickBodySchema.safeParse({ done: true, userId: "x" }).success).toBe(false);
    expect(addItemsBodySchema.safeParse({ items: [{ problemSlug: "two-sum", problemId: "x" }] }).success).toBe(false);
  });

  it("items: our problem by slug or a LeetCode link (normalized to its slug), 1–50 per batch", () => {
    const parsed = addItemsBodySchema.parse({
      items: [{ problemSlug: "two-sum" }, { leetcodeUrl: "https://leetcode.com/problems/meeting-rooms-ii/", title: "Meeting Rooms II" }],
      section: { title: "Week 1" },
    });
    expect(parsed.items[1]).toEqual({ leetcodeUrl: "meeting-rooms-ii", title: "Meeting Rooms II" });
    expect(addItemsBodySchema.safeParse({ items: [] }).success).toBe(false);
    expect(
      addItemsBodySchema.safeParse({ items: Array.from({ length: MAX_ITEMS_PER_BATCH + 1 }, () => ({ problemSlug: "two-sum" })) }).success,
    ).toBe(false);
    expect(addItemsBodySchema.safeParse({ items: [{ leetcodeUrl: "https://evil.example/problems/x/" }] }).success).toBe(false);
    expect(addItemsBodySchema.safeParse({ items: [{ problemSlug: "../etc" }] }).success).toBe(false);
  });

  it("update needs at least one change", () => {
    expect(updatePlanBodySchema.safeParse({}).success).toBe(false);
    expect(updatePlanBodySchema.safeParse({ visibility: "public" }).success).toBe(true);
    expect(updatePlanBodySchema.safeParse({ visibility: "everyone" }).success).toBe(false);
  });

  it("layout ids are uuids", () => {
    expect(layoutBodySchema.safeParse({ unsectioned: ["not-a-uuid"], sections: [] }).success).toBe(false);
  });
});

describe("discover params", () => {
  it("fall back to defaults instead of failing", () => {
    expect(parseDiscoverParams({})).toEqual({ q: "", sort: "popular", page: 1 });
    expect(parseDiscoverParams({ q: ["  dp \u0000 plan  ", "x"], sort: "new", page: "3" })).toEqual({ q: "dp plan", sort: "new", page: 3 });
    expect(parseDiscoverParams({ sort: "evil", page: "-1" })).toMatchObject({ sort: "popular", page: 1 });
    expect(parseDiscoverParams({ q: "x".repeat(500) }).q).toHaveLength(80);
  });
});

describe("PLANS_ENABLED", () => {
  it("is off by default and accepts only 0 / 1", () => {
    expect(parseEnv(BASE_ENV).PLANS_ENABLED).toBe("0");
    expect(parseEnv({ ...BASE_ENV, PLANS_ENABLED: "1" }).PLANS_ENABLED).toBe("1");
    expect(envSchema.safeParse({ ...BASE_ENV, PLANS_ENABLED: "yes" }).success).toBe(false);
  });

  it("shows the Plans nav item only when on", () => {
    expect(visibleNavLinks(true).map((l) => l.href)).not.toContain("/plans");
    expect(visibleNavLinks(true, { plans: false }).map((l) => l.href)).not.toContain("/plans");
    expect(visibleNavLinks(true, { plans: true }).map((l) => l.href)).toContain("/plans");
    expect(visibleNavLinks(false, { plans: true }).map((l) => l.href)).toEqual(["/problems", "/learn", "/plans"]);
  });
});
