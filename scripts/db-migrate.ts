// `pnpm db:migrate`: applies pending migrations from drizzle/ to DATABASE_URL.
import { existsSync } from "node:fs";

import { runMigrations } from "@/server/db/migrate";
import { getEnv } from "@/server/env";

async function main() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  await runMigrations(getEnv().DATABASE_URL);
  console.log("Migrations applied.");
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
