// `pnpm problems:import [--dir <path>] [--prune]`
// Validates every problem under --dir (default problems/) and upserts them by
// slug. Nothing is written if any problem fails validation.
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

import { createDb } from "@/server/db";
import { getEnv } from "@/server/env";
import { importProblems, loadProblems, ProblemValidationError } from "@/server/problems/importer";

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      dir: { type: "string", default: "problems" },
      prune: { type: "boolean", default: false },
    },
  });
  if (existsSync(".env")) process.loadEnvFile(".env");

  const loaded = await loadProblems(values.dir);
  const { db, pool } = createDb(getEnv().DATABASE_URL);
  try {
    const summary = await importProblems(db, loaded, { prune: values.prune });
    console.log(
      `Imported ${summary.imported.length} problems (${summary.testCount} tests, ${summary.tagCount} tags) from ${values.dir}.`,
    );
    if (values.prune) {
      console.log(
        summary.pruned.length > 0
          ? `Unpublished ${summary.pruned.length}: ${summary.pruned.join(", ")}`
          : "Nothing to unpublish.",
      );
    }
    return 0;
  } finally {
    await pool.end();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    if (error instanceof ProblemValidationError) {
      console.error(`problems:import failed, nothing was written:\n${error.errors.map((e) => `  ${e}`).join("\n")}`);
    } else {
      console.error("problems:import failed:", error instanceof Error ? error.message : error);
    }
    process.exit(1);
  },
);
