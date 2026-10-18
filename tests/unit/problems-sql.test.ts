import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  buildProblemsSql,
  buildProblemsSqlParts,
  dollarQuote,
  existingPartFiles,
  OUTPUT_FILE,
  PART_MAX_BYTES,
  partFile,
  PROBLEMS_DIR,
} from "../../scripts/export-problems-sql";
import { loadProblems } from "@/server/problems/importer";

/** What Postgres reads back from a dollar-quoted literal: the text up to the first closing tag. */
function parseDollarQuoted(literal: string): string {
  const tag = /^\$[a-z0-9]*\$/.exec(literal)![0];
  const end = literal.indexOf(tag, tag.length);
  expect(end + tag.length).toBe(literal.length);
  return literal.slice(tag.length, end);
}

describe("docs/supabase/problems.sql", () => {
  it("is up to date with problems/ (run `pnpm problems:export-sql` after editing a problem)", async () => {
    const sql = buildProblemsSql(await loadProblems(PROBLEMS_DIR));
    expect(readFileSync(OUTPUT_FILE, "utf8")).toBe(sql);
  });

  it("split parts problems-<n>.sql are up to date, under the size cap and cover every problem once", async () => {
    const loaded = await loadProblems(PROBLEMS_DIR);
    const parts = buildProblemsSqlParts(loaded);
    expect(existingPartFiles().sort()).toEqual(parts.map((_, i) => partFile(i + 1)).sort());
    parts.forEach((text, i) => {
      expect(readFileSync(partFile(i + 1), "utf8")).toBe(text);
      expect(Buffer.byteLength(text)).toBeLessThanOrEqual(PART_MAX_BYTES);
      expect(text.match(/^BEGIN;$/gm)).toHaveLength(1);
      expect(text.match(/^COMMIT;$/gm)).toHaveLength(1);
      expect(text).toContain(`part ${i + 1} of ${parts.length}`);
    });
    const upserts = parts.join("\n").match(/^-- ---- [a-z0-9-]+ ----$/gm) ?? [];
    expect(upserts.sort()).toEqual(loaded.map((p) => `-- ---- ${p.meta.slug} ----`).sort());
  });

  it("splits greedily and refuses a single problem over the cap", async () => {
    const loaded = await loadProblems(PROBLEMS_DIR);
    const two = loaded.slice(0, 2);
    const one = Buffer.byteLength(buildProblemsSql(two));
    expect(buildProblemsSqlParts(two, one + 2000)).toHaveLength(1);
    expect(buildProblemsSqlParts(two, Math.max(...two.map((p) => Buffer.byteLength(buildProblemsSql([p])))) + 2000)).toHaveLength(2);
    expect(() => buildProblemsSqlParts(two, 100)).toThrow(/over 100/);
  });

  it("is one transaction, deterministic, upserts by slug and states that hidden tests are included", async () => {
    const loaded = await loadProblems(PROBLEMS_DIR);
    const sql = buildProblemsSql(loaded);
    expect(buildProblemsSql(loaded)).toBe(sql);
    expect(sql.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(sql.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(sql.match(/^ON CONFLICT \("slug"\) DO UPDATE SET$/gm)).toHaveLength(loaded.length);
    expect(sql).toContain("HIDDEN test cases");
    expect(sql).toContain('"author_rating"');
  });
});

describe("dollarQuote", () => {
  it.each([
    "plain",
    "",
    "O'Brien \"x\" $$ ; DROP TABLE problems; --",
    "has $ly$ inside",
    "has $ly$ and $ly1$ and $ly2$",
    "ends with a tag prefix $ly",
    "ends with $ly1",
    "$ly$",
    "back\\slash '' \n newline",
  ])("round-trips %j", (text) => {
    expect(parseDollarQuoted(dollarQuote(text))).toBe(text);
  });

  it("is deterministic and picks a tag absent from the text", () => {
    expect(dollarQuote("a")).toBe("$ly$a$ly$");
    expect(dollarQuote("a $ly$ b")).toBe("$ly1$a $ly$ b$ly1$");
  });

  it("rejects NUL characters", () => {
    expect(() => dollarQuote("a\0b")).toThrow(/NUL/);
  });
});
