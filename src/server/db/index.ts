import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getEnv } from "@/server/env";

import * as schema from "./schema";

export { schema };

export type Db = NodePgDatabase<typeof schema>;

/** Creates a Drizzle client with its own pool; call `pool.end()` when done. */
export function createDb(connectionString: string): { db: Db; pool: Pool } {
  const pool = new Pool({ connectionString });
  return { db: drizzle(pool, { schema }), pool };
}

let shared: { db: Db; pool: Pool } | undefined;

/** Process-wide client for `DATABASE_URL`. */
export function getDb(): Db {
  shared ??= createDb(getEnv().DATABASE_URL);
  return shared.db;
}
