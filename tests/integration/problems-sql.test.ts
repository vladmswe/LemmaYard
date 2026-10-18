// docs/supabase/problems.sql writes exactly the rows `pnpm problems:import`
// writes, is idempotent, and survives hostile problem text.
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { buildProblemsSql, OUTPUT_FILE } from "../../scripts/export-problems-sql";
import { createDb } from "@/server/db";
import { problems } from "@/server/db/schema";
import { importProblems, loadProblems } from "@/server/problems/importer";

import { closeTestDb, getTestDb, resetTestDb, testDbUrl } from "../helpers/db";

/** Every column the import writes (ids included: identities restart on reset). */
async function snapshot() {
  const db = getTestDb();
  const rows = async (query: ReturnType<typeof sql>) => (await db.execute(query)).rows;
  return {
    problems: await rows(sql`
      SELECT number, slug, title, difficulty, description_md, signature::text, compare::text,
             time_limit_ms, memory_limit_mb, published, author_rating, rating_adjust
      FROM problems ORDER BY slug`),
    tags: await rows(sql`SELECT id, slug, name FROM tags ORDER BY id`),
    problemTags: await rows(sql`
      SELECT p.slug AS problem, t.slug AS tag FROM problem_tags pt
      JOIN problems p ON p.id = pt.problem_id JOIN tags t ON t.id = pt.tag_id
      ORDER BY 1, 2`),
    testCases: await rows(sql`
      SELECT tc.id, p.slug, tc.position, tc.input::text, tc.expected::text, tc.is_sample
      FROM test_cases tc JOIN problems p ON p.id = tc.problem_id ORDER BY tc.id`),
  };
}

let scriptDb: ReturnType<typeof createDb> | undefined;

/** Runs a multi-statement script (simple query protocol, like the SQL Editor). */
async function runScript(script: string) {
  const client = await (scriptDb ??= createDb(testDbUrl())).pool.connect();
  try {
    await client.query(script);
  } catch (error) {
    // A failed script leaves its explicit BEGIN open and aborted.
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

beforeEach(resetTestDb);
afterAll(async () => {
  await scriptDb?.pool.end();
  await closeTestDb();
});

describe("docs/supabase/problems.sql", () => {
  it("writes the same rows as problems:import, and again when re-run", async () => {
    await importProblems(getTestDb(), await loadProblems("problems"));
    const imported = await snapshot();
    expect(imported.problems).toHaveLength(20);

    await resetTestDb();
    const script = await readFile(OUTPUT_FILE, "utf8");
    await runScript(script);
    expect(await snapshot()).toEqual(imported);

    const firstIds = (await getTestDb().execute(sql`SELECT id, slug FROM problems ORDER BY slug`)).rows;
    await runScript(script);
    const again = await snapshot();
    expect(again.problems).toEqual(imported.problems);
    expect(again.tags).toEqual(imported.tags);
    expect(again.problemTags).toEqual(imported.problemTags);
    // Test cases are replaced (new identity ids), with the same content.
    const strip = (rows: Record<string, unknown>[]) =>
      rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "id")));
    expect(strip(again.testCases)).toEqual(strip(imported.testCases));
    expect((await getTestDb().execute(sql`SELECT id, slug FROM problems ORDER BY slug`)).rows).toEqual(firstIds);
  });

  it("stores hostile titles and descriptions verbatim and refuses a taken number", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "lemmayard-problems-sql-"));
    try {
      await cp(path.join(process.cwd(), "tests/fixtures/problems"), dir, { recursive: true });
      const title = `O'Brien "$$" $ly$ $ly1$'); DROP TABLE problems; --`;
      const description = "Ends with a tag prefix $ly\n$$ $q$ \\' '' \\\\ ; COMMIT; $ly";
      const metaFile = path.join(dir, "fixture-evens", "meta.json");
      const meta = JSON.parse(await readFile(metaFile, "utf8"));
      await writeFile(metaFile, JSON.stringify({ ...meta, title }));
      await writeFile(path.join(dir, "fixture-evens", "description.md"), description);

      await runScript(buildProblemsSql(await loadProblems(dir)));
      const rows = (
        await getTestDb().execute<{ title: string; description_md: string }>(
          sql`SELECT title, description_md FROM problems WHERE slug = 'fixture-evens'`,
        )
      ).rows;
      expect(rows).toEqual([{ title, description_md: description }]);
      expect(await getTestDb().$count(problems)).toBe(3);

      await getTestDb().execute(sql`UPDATE problems SET slug = 'someone-else' WHERE slug = 'fixture-evens'`);
      await expect(runScript(buildProblemsSql(await loadProblems(dir)))).rejects.toThrow(
        /problem numbers already used by other problems in the database: someone-else \(9002\)/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
