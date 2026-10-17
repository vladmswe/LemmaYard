// Spawns the real `problems:import` CLI on an invalid fixture: validation
// fails before any database access, so no Postgres is needed.
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const run = promisify(execFile);

describe("scripts/import-problems.ts", () => {
  it("exits 1 naming the file and field on invalid problems", async () => {
    const tsx = path.join(process.cwd(), "node_modules/.bin/tsx");
    const result = await run(
      tsx,
      ["scripts/import-problems.ts", "--dir", "tests/fixtures/invalid/few-tests"],
      { cwd: process.cwd() },
    ).then(
      () => ({ code: 0, stderr: "" }),
      (error: { code: number; stderr: string }) => error,
    );
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("problems:import failed, nothing was written:");
    expect(result.stderr).toMatch(
      /tests\/fixtures\/invalid\/few-tests\/fixture-join-words\/tests\.json: at least 5 tests are required/,
    );
  }, 30_000);
});
