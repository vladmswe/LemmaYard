import path from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDb } from "./index";

export const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

/** Applies pending migrations from `drizzle/` to the given database. */
export async function runMigrations(connectionString: string): Promise<void> {
  const { db, pool } = createDb(connectionString);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await pool.end();
  }
}
