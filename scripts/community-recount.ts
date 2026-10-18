// `pnpm community:recount [--check]`: rebuilds the community counters (vote
// counts, reply and comment counts, problem likes) from their source rows
// (docs/specs/community.md §C.1). `--check` only reports drift and exits 1
// when there is any. Safe to run any time; uses DATABASE_URL_DIRECT.
import { existsSync } from "node:fs";
import { parseArgs } from "node:util";

import { createDb, directDatabaseUrl } from "@/server/db";
import { describeDbTarget } from "@/server/db/config";
import { counterDrift, recountCommunity } from "@/server/community/recount";

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { check: { type: "boolean", default: false } } });
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = directDatabaseUrl();
  console.log(`Database: ${describeDbTarget(url)}`);
  const { db, pool } = createDb(url);
  try {
    const drift = await counterDrift(db);
    console.log(drift.length === 0 ? "All counters match a recount." : `${drift.length} counter(s) drifted.`);
    for (const d of drift.slice(0, 20)) console.log(`  ${d.table}.${d.column} ${d.id}: ${d.stored} -> ${d.actual}`);
    if (values.check) return drift.length === 0 ? 0 : 1;
    if (drift.length > 0) {
      const changed = await recountCommunity(db);
      console.log(`Rewrote: ${Object.entries(changed).map(([t, n]) => `${t} ${n}`).join(", ")}.`);
    }
    return 0;
  } finally {
    await pool.end();
  }
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error("community:recount failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
