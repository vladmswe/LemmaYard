import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { problems, problemTags, tags, testCases } from "@/server/db/schema";
import {
  importProblems,
  loadProblems,
  ProblemValidationError,
} from "@/server/problems/importer";

import { closeTestDb, getTestDb, resetTestDb } from "../helpers/db";

const FIXTURES = path.join(process.cwd(), "tests/fixtures/problems");
const INVALID = path.join(process.cwd(), "tests/fixtures/invalid");

async function importDir(dir: string, prune = false) {
  return importProblems(getTestDb(), await loadProblems(dir), { prune });
}

async function counts() {
  const db = getTestDb();
  return {
    problems: await db.$count(problems),
    published: await db.$count(problems, eq(problems.published, true)),
    tags: await db.$count(tags),
    problemTags: await db.$count(problemTags),
    testCases: await db.$count(testCases),
  };
}

let tmp: string | undefined;
async function copyFixtures(): Promise<string> {
  tmp = await mkdtemp(path.join(tmpdir(), "leetcopy-import-"));
  await cp(FIXTURES, tmp, { recursive: true });
  return tmp;
}

beforeEach(resetTestDb);
afterEach(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
  tmp = undefined;
});
afterAll(closeTestDb);

describe("importProblems", () => {
  it("imports the fixture problems with tags and test cases", async () => {
    const summary = await importDir(FIXTURES);
    expect(summary.imported.sort()).toEqual(["fixture-average", "fixture-evens", "fixture-join-words"]);
    expect(await counts()).toEqual({ problems: 3, published: 3, tags: 4, problemTags: 6, testCases: 16 });

    const db = getTestDb();
    const [evens] = await db.select().from(problems).where(eq(problems.slug, "fixture-evens"));
    expect(evens).toMatchObject({
      number: 9002,
      title: "Fixture: Even Numbers",
      difficulty: "medium",
      compare: { mode: "unordered" },
      signature: { name: "evens", params: [{ name: "nums", type: "int[]" }], returns: "int[]" },
      // meta.json has no "limits": defaults apply.
      timeLimitMs: 2000,
      memoryLimitMb: 256,
      published: true,
    });
    expect(evens.descriptionMd).toContain("even numbers");

    const cases = await db
      .select()
      .from(testCases)
      .where(eq(testCases.problemId, evens.id))
      .orderBy(asc(testCases.position));
    expect(cases.map((c) => c.position)).toEqual([0, 1, 2, 3, 4]);
    expect(cases.map((c) => c.isSample)).toEqual([true, false, false, false, false]);
    expect(cases[4].input).toEqual({ nums: [9007199254740990, -9007199254740990] });

    const [average] = await db.select().from(problems).where(eq(problems.slug, "fixture-average"));
    expect(average.compare).toEqual({ mode: "float", epsilon: 1e-6 });
    const tagRows = await db.select().from(tags).orderBy(asc(tags.slug));
    expect(tagRows.map((t) => [t.slug, t.name])).toEqual([
      ["array", "Array"],
      ["fixture", "Fixture"],
      ["math", "Math"],
      ["string", "String"],
    ]);
  });

  it("is idempotent: re-import keeps ids and counts and replaces test cases", async () => {
    await importDir(FIXTURES);
    const db = getTestDb();
    const before = await db.select({ id: problems.id, slug: problems.slug }).from(problems);
    const caseIdsBefore = (await db.select({ id: testCases.id }).from(testCases)).map((r) => r.id);

    await importDir(FIXTURES);
    expect(await counts()).toEqual({ problems: 3, published: 3, tags: 4, problemTags: 6, testCases: 16 });
    const after = await db.select({ id: problems.id, slug: problems.slug }).from(problems);
    expect(after.sort((a, b) => a.slug.localeCompare(b.slug))).toEqual(
      before.sort((a, b) => a.slug.localeCompare(b.slug)),
    );
    const caseIdsAfter = (await db.select({ id: testCases.id }).from(testCases)).map((r) => r.id);
    expect(Math.min(...caseIdsAfter)).toBeGreaterThan(Math.max(...caseIdsBefore));
  });

  it("applies edits to metadata, tags and tests on re-import", async () => {
    const dir = await copyFixtures();
    await importDir(dir);

    const metaFile = path.join(dir, "fixture-evens/meta.json");
    const meta = JSON.parse(await readFile(metaFile, "utf8"));
    meta.title = "Renamed";
    meta.tags = ["array", "sorting"];
    await writeFile(metaFile, JSON.stringify(meta));
    const testsFile = path.join(dir, "fixture-evens/tests.json");
    const tests = JSON.parse(await readFile(testsFile, "utf8"));
    tests.push({ input: { nums: [8] }, expected: [8] });
    await writeFile(testsFile, JSON.stringify(tests));

    await importDir(dir);
    const db = getTestDb();
    const [evens] = await db.select().from(problems).where(eq(problems.slug, "fixture-evens"));
    expect(evens.title).toBe("Renamed");
    expect(await db.$count(testCases, eq(testCases.problemId, evens.id))).toBe(6);
    const linked = await db
      .select({ slug: tags.slug })
      .from(problemTags)
      .innerJoin(tags, eq(tags.id, problemTags.tagId))
      .where(eq(problemTags.problemId, evens.id));
    expect(linked.map((t) => t.slug).sort()).toEqual(["array", "sorting"]);
  });

  it("--prune unpublishes problems whose directory is gone; without it they stay", async () => {
    const dir = await copyFixtures();
    await importDir(dir);
    await rm(path.join(dir, "fixture-join-words"), { recursive: true });

    await importDir(dir);
    expect((await counts()).published).toBe(3);

    const summary = await importDir(dir, true);
    expect(summary.pruned).toEqual(["fixture-join-words"]);
    expect(await counts()).toMatchObject({ problems: 3, published: 2 });

    // Re-adding the directory publishes it again.
    await importDir(FIXTURES, true);
    expect((await counts()).published).toBe(3);
  });

  it("writes nothing when any problem is invalid", async () => {
    await expect(importDir(path.join(INVALID, "mixed-valid-invalid"))).rejects.toThrow(
      ProblemValidationError,
    );
    expect(await counts()).toEqual({ problems: 0, published: 0, tags: 0, problemTags: 0, testCases: 0 });
  });

  it("rejects a number already used by another slug in the database, writing nothing", async () => {
    await importDir(FIXTURES);
    const dir = await mkdtemp(path.join(tmpdir(), "leetcopy-import-"));
    tmp = dir;
    await cp(path.join(FIXTURES, "fixture-evens"), path.join(dir, "fixture-evens-two"), { recursive: true });
    await cp(path.join(FIXTURES, "fixture-average"), path.join(dir, "fixture-average"), { recursive: true });
    const metaFile = path.join(dir, "fixture-evens-two/meta.json");
    const meta = JSON.parse(await readFile(metaFile, "utf8"));
    meta.slug = "fixture-evens-two";
    await writeFile(metaFile, JSON.stringify(meta));
    // Also change the valid problem, to prove the transaction rolled back.
    const avgFile = path.join(dir, "fixture-average/meta.json");
    const avg = JSON.parse(await readFile(avgFile, "utf8"));
    avg.title = "Changed";
    await writeFile(avgFile, JSON.stringify(avg));

    const error = await importDir(dir, true).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ProblemValidationError);
    expect((error as ProblemValidationError).errors).toEqual([
      expect.stringMatching(
        /fixture-evens-two\/meta\.json: number: duplicate number 9002 \(already used by "fixture-evens" in the database\)$/,
      ),
    ]);
    expect(await counts()).toEqual({ problems: 3, published: 3, tags: 4, problemTags: 6, testCases: 16 });
    const [average] = await getTestDb().select().from(problems).where(eq(problems.slug, "fixture-average"));
    expect(average.title).toBe("Fixture: Average");
  });
});
