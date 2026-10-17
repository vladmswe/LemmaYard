import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getEnv } from "@/server/env";
import { logError } from "@/server/log";

import { buildDbConfig, type DbConfigInput } from "./config";
import * as schema from "./schema";

export { schema };

export type Db = NodePgDatabase<typeof schema>;

export type DbOptions = Omit<DbConfigInput, "connectionString">;

/** Pool/TLS settings from DATABASE_SSL, DATABASE_SSL_CA, DATABASE_POOL_MAX and VERCEL. */
export function dbOptionsFromEnv(): DbOptions {
  const env = getEnv();
  return {
    ssl: env.DATABASE_SSL,
    sslCa: env.DATABASE_SSL_CA,
    poolMax: env.DATABASE_POOL_MAX,
    serverless: Boolean(env.VERCEL),
  };
}

/** Creates a Drizzle client with its own pool; call `pool.end()` when done. */
export function createDb(
  connectionString: string,
  options: DbOptions = dbOptionsFromEnv(),
): { db: Db; pool: Pool } {
  const pool = new Pool(buildDbConfig({ connectionString, ...options }).pool);
  // An idle client losing its connection (pooler restart, network) emits
  // `error` on the pool; unhandled, that would crash the process.
  pool.on("error", (error) => logError("db.pool_error", error));
  return { db: drizzle(pool, { schema }), pool };
}

/** Direct connection for migrations and imports: DATABASE_URL_DIRECT, else DATABASE_URL. */
export function directDatabaseUrl(): string {
  const env = getEnv();
  return env.DATABASE_URL_DIRECT ?? env.DATABASE_URL;
}

// Stored on globalThis so dev-server module reloads and duplicate module
// instances share one pool per process instead of leaking connections.
const SHARED = Symbol.for("app.db.shared");
type GlobalWithDb = typeof globalThis & { [SHARED]?: { db: Db; pool: Pool } };

/** Process-wide client for `DATABASE_URL`. */
export function getDb(): Db {
  const g = globalThis as GlobalWithDb;
  g[SHARED] ??= createDb(getEnv().DATABASE_URL);
  return g[SHARED].db;
}
