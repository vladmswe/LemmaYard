// LeetCode catalog (docs/specs/leetcode-integration.md AC-LC-1, -2, -3, -8):
// the committed files, the Zod schemas against hostile entries, the
// difficulty bands, the overlay merge, and the offline generator CLI.
import { execFile } from "node:child_process";
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { afterAll, describe, expect, it } from "vitest";

import {
  catalogFileSchema,
  isHidden,
  LEETCODE_TAG_SLUGS,
  mergeCatalog,
  overlayFileSchema,
  type CatalogFile,
  type OverlayFile,
} from "@/lib/leetcode/catalog-schema";
import { DIFFICULTY_BANDS, difficultyFromRating } from "@/lib/leetcode/difficulty";
import { buildCatalog, serializeCatalog, updateNotice } from "@/lib/leetcode/generate";
import { DATASET_LICENCE_TEXT, LEETCODE_NOT_AFFILIATED, provenanceOf } from "@/lib/leetcode/labels";
import { loadCatalog } from "@/server/leetcode/catalog";

const run = promisify(execFile);
const ROOT = process.cwd();
const catalogRaw = JSON.parse(readFileSync("src/server/leetcode/catalog.json", "utf8")) as unknown;
const overlayRaw = JSON.parse(readFileSync("src/server/leetcode/overlay.json", "utf8")) as unknown;
const notice = readFileSync("src/server/leetcode/NOTICE.md", "utf8");

const SOURCE = {
  name: "zerotrac/leetcode_problem_rating",
  url: "https://github.com/zerotrac/leetcode_problem_rating",
  commit: "a".repeat(40),
  licence: "MIT",
  retrievedAt: "2026-10-18",
} as const;

function entry(n: number, slug: string, rating = 1500, title = `Problem ${n}`) {
  return { n, slug, title, rating, contest: "weekly-contest-100", q: 2 };
}
function catalogOf(problems: unknown[]): unknown {
  return { version: 1, source: SOURCE, problems };
}

/** Tag slugs used by our own problems (problems/<slug>/meta.json). */
function ourTags(): Set<string> {
  const tags = new Set<string>();
  for (const dir of readdirSync("problems")) {
    try {
      const meta = JSON.parse(readFileSync(path.join("problems", dir, "meta.json"), "utf8")) as { tags?: string[] };
      for (const t of meta.tags ?? []) tags.add(t);
    } catch {
      // not a problem folder
    }
  }
  return tags;
}

describe("committed catalog and overlay (AC-LC-2)", () => {
  const catalog = catalogFileSchema.parse(catalogRaw);
  const overlay = overlayFileSchema.parse(overlayRaw);

  it("pass the schemas and merge without issues", () => {
    const loaded = loadCatalog(catalogRaw, overlayRaw);
    expect(loaded.ok ? [] : loaded.issues).toEqual([]);
    expect(catalog.problems.length).toBeGreaterThan(2000);
  });

  it("has unique slugs and numbers, also with the overlay's extra problems", () => {
    const merged = mergeCatalog(catalog, overlay);
    if (!merged.ok) throw new Error(merged.issues.join("\n"));
    expect(new Set(merged.problems.map((p) => p.slug)).size).toBe(merged.problems.length);
    expect(new Set(merged.problems.map((p) => p.n)).size).toBe(merged.problems.length);
  });

  it("uses only our tag slugs (the LeetCode tag list is a subset of the tags of problems/)", () => {
    const ours = ourTags();
    expect(LEETCODE_TAG_SLUGS.filter((t) => !ours.has(t))).toEqual([]);
    for (const [slug, o] of Object.entries(overlay.problems)) {
      for (const t of o.tags ?? []) expect(ours.has(t), `${slug}: ${t}`).toBe(true);
      expect((o.tags ?? []).length, slug).toBeLessThanOrEqual(4);
    }
  });

  it("labels every agent estimate as estimated and keeps the classics list small", () => {
    const extras = Object.entries(overlay.problems).filter(([slug]) => !catalog.problems.some((p) => p.slug === slug));
    expect(extras.length).toBeLessThanOrEqual(60);
    for (const [slug, o] of extras) {
      expect(o.difficultySource, slug).toBe("estimated");
      expect(o.rating, slug).toBeUndefined();
    }
    for (const [slug, o] of Object.entries(overlay.problems)) {
      if (o.tags) expect(o.tagsSource, slug).toBe("estimated");
    }
  });

  it("holds only facts: no statement-like fields", () => {
    for (const p of catalog.problems) expect(Object.keys(p).sort()).toEqual(["contest", "n", "q", "rating", "slug", "title"]);
  });

  it("NOTICE.md has the MIT notice, the not-affiliated line and the catalog's commit", () => {
    expect(notice).toContain(DATASET_LICENCE_TEXT);
    expect(notice.replace(/\s+/g, " ")).toContain(LEETCODE_NOT_AFFILIATED);
    expect(notice).toContain(`Dataset commit: \`${catalog.source.commit}\``);
    expect(notice).toContain(`Retrieved: ${catalog.source.retrievedAt}`);
  });

  it("the committed catalog is the generator's own output format (stable diffs)", () => {
    expect(serializeCatalog(catalog)).toBe(readFileSync("src/server/leetcode/catalog.json", "utf8"));
  });
});

describe("schemas reject hostile entries", () => {
  const bad: [string, unknown][] = [
    ["bad slug", entry(1, "Two_Sum")],
    ["slug with a dot segment", entry(1, "two..sum")],
    ["over-long slug", entry(1, "a".repeat(101))],
    ["bidi override in title", entry(1, "x", 1500, "Safe‮elif.exe")],
    ["zero-width space in title", entry(1, "x", 1500, "Two​Sum")],
    ["control character in title", entry(1, "x", 1500, "Two\u0007Sum")],
    ["padded title", entry(1, "x", 1500, " Two Sum")],
    ["HTML-ish title is fine as text but over-long", entry(1, "x", 1500, "<b>".repeat(40))],
    ["rating too high", entry(1, "x", 5000)],
    ["rating not an integer", entry(1, "x", 1500.5)],
    ["number 0", entry(0, "x")],
    ["extra key (statement)", { ...entry(1, "x"), statement: "Given an array…" }],
    ["bad contest", { ...entry(1, "x"), contest: "https://leetcode.com/contest/x" }],
    ["position 9", { ...entry(1, "x"), q: 9 }],
  ];
  it.each(bad)("catalog: %s", (_name, e) => {
    expect(catalogFileSchema.safeParse(catalogOf([e])).success).toBe(false);
  });

  it("catalog: duplicate slugs, duplicate numbers and unsorted entries", () => {
    expect(catalogFileSchema.safeParse(catalogOf([entry(1, "a"), entry(2, "a")])).success).toBe(false);
    expect(catalogFileSchema.safeParse(catalogOf([entry(1, "a"), entry(1, "b")])).success).toBe(false);
    expect(catalogFileSchema.safeParse(catalogOf([entry(2, "a"), entry(1, "b")])).success).toBe(false);
    expect(catalogFileSchema.safeParse(catalogOf([entry(1, "a"), entry(2, "b")])).success).toBe(true);
  });

  it("catalog: source must name the dataset, a 40-hex commit and MIT", () => {
    const ok = catalogOf([entry(1, "a")]) as { source: Record<string, string> };
    for (const patch of [{ commit: "main" }, { licence: "GPL" }, { url: "https://leetcode.com/" }, { retrievedAt: "yesterday" }]) {
      expect(catalogFileSchema.safeParse({ ...ok, source: { ...ok.source, ...patch } }).success).toBe(false);
    }
  });

  it("overlay: unknown tags, too many tags, unknown keys, bad slugs as keys", () => {
    const o = (problems: unknown) => overlayFileSchema.safeParse({ version: 1, problems }).success;
    expect(o({ a: { tags: ["array"] } })).toBe(true);
    expect(o({ a: { tags: ["segment-tree"] } })).toBe(false);
    expect(o({ a: { tags: ["array", "array"] } })).toBe(false);
    expect(o({ a: { tags: [...LEETCODE_TAG_SLUGS].slice(0, 9) } })).toBe(false);
    expect(o({ a: { statement: "copied text" } })).toBe(false);
    expect(o({ "Bad Slug": { premium: true } })).toBe(false);
    expect(o({ a: { note: "x".repeat(201) } })).toBe(false);
    expect(o({ a: { difficulty: "impossible" } })).toBe(false);
  });

  it("loadCatalog returns issues instead of throwing on bad data", () => {
    expect(loadCatalog({ version: 2 }, { version: 1, problems: {} }).ok).toBe(false);
    expect(loadCatalog(catalogOf([entry(1, "a")]), { version: 1, problems: { a: { title: "Renamed" } } }).ok).toBe(false);
    expect(loadCatalog(catalogOf([entry(1, "a")]), { version: 1, problems: { b: { difficulty: "easy" } } }).ok).toBe(false);
    expect(loadCatalog(catalogOf([entry(1, "a")]), { version: 1, problems: { b: { n: 1, title: "Clash" } } }).ok).toBe(false);
  });
});

describe("difficulty from rating (AC-LC-3)", () => {
  it("uses the documented bands", () => {
    expect(DIFFICULTY_BANDS).toEqual({ mediumFrom: 1450, hardFrom: 1850 });
    expect(difficultyFromRating(800)).toBe("easy");
    expect(difficultyFromRating(1449)).toBe("easy");
    expect(difficultyFromRating(1450)).toBe("medium");
    expect(difficultyFromRating(1849)).toBe("medium");
    expect(difficultyFromRating(1850)).toBe("hard");
    expect(difficultyFromRating(4000)).toBe("hard");
  });
});

describe("overlay merge precedence", () => {
  const catalog = catalogFileSchema.parse(catalogOf([entry(1, "low", 1300), entry(2, "mid", 1600), entry(3, "top", 2400)]));
  const overlay = (problems: OverlayFile["problems"]): OverlayFile => ({ version: 1, problems });

  it("derives difficulty from the rating, flagged as estimated", () => {
    const m = mergeCatalog(catalog, overlay({}));
    if (!m.ok) throw new Error();
    expect(m.problems.map((p) => [p.slug, p.difficulty, p.difficultySource, p.ratingSource])).toEqual([
      ["low", "easy", "rating", "zerotrac"],
      ["mid", "medium", "rating", "zerotrac"],
      ["top", "hard", "rating", "zerotrac"],
    ]);
    expect(provenanceOf(m.problems[0])).toEqual({ difficultyEstimated: true, ratingSource: "zerotrac", tagsEstimated: false });
  });

  it("an overlay difficulty wins (owner by default), tags carry their source, flags hide", () => {
    const m = mergeCatalog(
      catalog,
      overlay({
        low: { difficulty: "medium" },
        mid: { tags: ["graph", "array"], tagsSource: "estimated", difficulty: "hard", difficultySource: "estimated" },
        top: { premium: true },
      }),
    );
    if (!m.ok) throw new Error();
    const [low, mid, top] = m.problems;
    expect([low.difficulty, low.difficultySource, provenanceOf(low).difficultyEstimated]).toEqual(["medium", "owner", false]);
    expect([mid.difficulty, mid.difficultySource, mid.tags, mid.tagsSource]).toEqual(["hard", "estimated", ["array", "graph"], "estimated"]);
    expect(provenanceOf(mid)).toEqual({ difficultyEstimated: true, ratingSource: "zerotrac", tagsEstimated: true });
    expect(isHidden(top)).toBe(true);
    expect(mid.rating).toBe(1600);
  });

  it("adds extra problems: with a rating they get a derived difficulty; without one only the overlay's", () => {
    const m = mergeCatalog(
      catalog,
      overlay({
        "two-sum": { n: 9001, title: "Extra With Rating", rating: 1200, ratingSource: "estimated" },
        "no-rating": { n: 9002, title: "Extra Labelled", difficulty: "medium", difficultySource: "estimated" },
        bare: { n: 9003, title: "Extra Bare" },
      }),
    );
    if (!m.ok) throw new Error();
    const by = new Map(m.problems.map((p) => [p.slug, p]));
    expect([by.get("two-sum")!.difficulty, by.get("two-sum")!.ratingSource]).toEqual(["easy", "estimated"]);
    expect([by.get("no-rating")!.difficulty, by.get("no-rating")!.rating]).toEqual(["medium", null]);
    expect([by.get("bare")!.difficulty, by.get("bare")!.difficultySource]).toEqual([null, null]);
    expect(m.problems.map((p) => p.n)).toEqual([1, 2, 3, 9001, 9002, 9003]);
  });
});

describe("generator (AC-LC-1)", () => {
  const work = mkdtempSync(path.join(tmpdir(), "lc-gen-"));
  afterAll(() => rmSync(work, { recursive: true, force: true }));
  const tsx = path.join(ROOT, "node_modules/.bin/tsx");
  const commit = "1".repeat(40);

  async function cli(args: string[]) {
    return run(tsx, ["scripts/leetcode-catalog.ts", ...args], { cwd: ROOT }).then(
      (r) => ({ code: 0, stdout: r.stdout, stderr: r.stderr }),
      (e: { code: number; stdout: string; stderr: string }) => e,
    );
  }

  it("produces the expected file byte for byte, prints skip counts, and is idempotent", async () => {
    const out = path.join(work, "catalog.json");
    const noticeCopy = path.join(work, "NOTICE.md");
    copyFileSync("src/server/leetcode/NOTICE.md", noticeCopy);
    const args = ["--input", "tests/fixtures/leetcode/data.json", "--commit", commit, "--date", "2026-01-02", "--out", out, "--notice", noticeCopy, "--min", "3"];
    const first = await cli(args);
    expect(first.code).toBe(0);
    expect(first.stdout).toContain("skipped (bad slug): 1");
    expect(first.stdout).toContain("skipped (bad title): 2");
    expect(first.stdout).toContain("skipped (rating out of range): 1");
    expect(first.stdout).toContain("skipped (duplicate slug): 1");
    expect(first.stdout).toContain("5 problems, 5 skipped, rating range 1201–2211");
    const expected = readFileSync("tests/fixtures/leetcode/expected-catalog.json", "utf8");
    expect(readFileSync(out, "utf8")).toBe(expected);
    expect(readFileSync(noticeCopy, "utf8")).toContain(`Dataset commit: \`${commit}\``);
    const again = await cli(args);
    expect(again.code).toBe(0);
    expect(readFileSync(out, "utf8")).toBe(expected);
  }, 60_000);

  it("exits 1 for a non-array input and for too few valid records, writing nothing", async () => {
    const notArray = path.join(work, "object.json");
    writeFileSync(notArray, JSON.stringify({ problems: [] }));
    const out = path.join(work, "never.json");
    const r1 = await cli(["--input", notArray, "--commit", commit, "--out", out, "--notice", path.join(work, "NOTICE.md")]);
    expect(r1.code).toBe(1);
    expect(r1.stderr).toContain("not a JSON array");
    const r2 = await cli(["--input", "tests/fixtures/leetcode/data.json", "--commit", commit, "--out", out, "--notice", path.join(work, "NOTICE.md"), "--min", "6"]);
    expect(r2.code).toBe(1);
    expect(r2.stderr).toContain("only 5 valid problems");
    expect(() => readFileSync(out)).toThrow();
    const r3 = await cli(["--input", "tests/fixtures/leetcode/data.json", "--commit", "main"]);
    expect(r3.code).toBe(1);
  }, 60_000);

  it("is order independent", () => {
    const data = JSON.parse(readFileSync("tests/fixtures/leetcode/data.json", "utf8")) as unknown[];
    const a = buildCatalog(data, { commit, date: "2026-01-02", minRecords: 3 });
    const b = buildCatalog([...data].reverse(), { commit, date: "2026-01-02", minRecords: 3 });
    if (!a.ok || !b.ok) throw new Error("build failed");
    expect(serializeCatalog(b.catalog)).toBe(serializeCatalog(a.catalog));
    expect((serializeCatalog(a.catalog) as string).length).toBeGreaterThan(0);
    const parsed: CatalogFile = catalogFileSchema.parse(JSON.parse(serializeCatalog(a.catalog)));
    expect(parsed.problems).toHaveLength(5);
  });

  it("updates only the marked NOTICE lines", () => {
    const next = updateNotice(notice, "b".repeat(40), "2027-05-06");
    expect(next).toContain(`Dataset commit: \`${"b".repeat(40)}\``);
    expect(next).toContain("Retrieved: 2027-05-06");
    expect(next.replace(/Dataset commit: `[0-9a-f]{40}`|Retrieved: \S+/g, "")).toBe(
      notice.replace(/Dataset commit: `[0-9a-f]{40}`|Retrieved: \S+/g, ""),
    );
  });

  it("never imports a network module or calls fetch (offline by design)", () => {
    for (const file of ["scripts/leetcode-catalog.ts", "src/lib/leetcode/generate.ts", "src/lib/leetcode/catalog-schema.ts", "src/server/leetcode/catalog.ts"]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toMatch(/from\s+["'](?:node:)?(?:https?|http2|net|tls|dgram|undici)["']/);
      expect(src, file).not.toMatch(/require\(\s*["'](?:node:)?(?:https?|http2|net|tls)["']/);
      expect(src, file).not.toMatch(/\bfetch\s*\(/);
      expect(src, file).not.toMatch(/child_process|execSync|spawn\(/);
    }
  });
});
