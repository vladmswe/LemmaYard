// `pnpm plans:unpublish <plan-id>`: makes a study plan private and drops its
// share link (admin takedown, docs/specs/community.md §B.8). Uses
// DATABASE_URL_DIRECT (falls back to DATABASE_URL). Prints no plan content.
import { existsSync } from "node:fs";

import { createDb, directDatabaseUrl } from "@/server/db";
import { describeDbTarget } from "@/server/db/config";
import { unpublishPlan } from "@/server/plans/admin";

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const planId = process.argv[2];
  if (!planId || process.argv.length > 3) {
    console.error("Usage: pnpm plans:unpublish <plan-id>");
    process.exit(2);
  }
  const url = directDatabaseUrl();
  const { db, pool } = createDb(url);
  try {
    const result = await unpublishPlan(db, planId);
    if (!result) {
      console.error(`No study plan with id ${JSON.stringify(planId)} on ${describeDbTarget(url)}.`);
      process.exitCode = 1;
      return;
    }
    console.log(`Plan ${planId} was ${result.previous}; it is now private and its share link no longer works.`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error("plans:unpublish failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
