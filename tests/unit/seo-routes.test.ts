import { beforeAll, describe, expect, it, vi } from "vitest";

// The database is down for this test: the sitemap must still list the static pages.
vi.mock("@/server/db", () => ({
  getDb: () => {
    throw new Error("database unavailable");
  },
}));
vi.mock("@/server/log", () => ({ logError: vi.fn() }));

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { publishedLessons } from "@/content/learn";

beforeAll(() => {
  // getEnv() is parsed lazily on first use, so stubbing here is enough.
  vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5433/db");
  vi.stubEnv("AUTH_SECRET", "x".repeat(32));
  vi.stubEnv("AUTH_URL", "https://lemmayard.example/some/path");
});

describe("robots.txt", () => {
  it("points at the sitemap on the AUTH_URL origin and keeps private areas out", () => {
    const r = robots();
    expect(r.sitemap).toBe("https://lemmayard.example/sitemap.xml");
    const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rules.disallow).toEqual(expect.arrayContaining(["/api/", "/rooms", "/submissions"]));
  });
});

describe("sitemap.xml", () => {
  it("lists public pages and published lessons only, even without the database", async () => {
    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toEqual(
      expect.arrayContaining([
        "https://lemmayard.example/",
        "https://lemmayard.example/problems",
        "https://lemmayard.example/learn",
        "https://lemmayard.example/learn/glossary",
        ...publishedLessons().map((l) => `https://lemmayard.example/learn/${l.slug}`),
      ]),
    );
    expect(urls.some((u) => /\/(rooms|submissions|login|register|api)\b/.test(u))).toBe(false);
    expect(urls.some((u) => u.includes("dev-fixtures") || u.includes("_fixture"))).toBe(false);
  });
});
