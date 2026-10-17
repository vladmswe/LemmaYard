// `pnpm db:migrate`: applies pending migrations from drizzle/ to
// DATABASE_URL_DIRECT (falls back to DATABASE_URL).
import { existsSync } from "node:fs";

import { directDatabaseUrl } from "@/server/db";
import { describeDbTarget } from "@/server/db/config";
import { runMigrations } from "@/server/db/migrate";

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = directDatabaseUrl();
  console.log(`Applying migrations to ${describeDbTarget(url)}`);
  await runMigrations(url);
  console.log("Migrations applied.");
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
