import { z } from "zod";

// Relative import: drizzle.config.ts loads this file outside the `@/` alias.
import { DB_SSL_MODES } from "./db/config";

const int = (def: number) => z.coerce.number().int().positive().default(def);

export const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.url(),
  // Direct (non-transaction-pooled) connection for db:migrate / db:seed /
  // problems:import; falls back to DATABASE_URL.
  DATABASE_URL_DIRECT: z.url().optional(),
  // TLS: disable | require (verified) | no-verify; see src/server/db/config.ts.
  // Unset: from the URL's sslmode, else disable for local hosts, no-verify otherwise.
  DATABASE_SSL: z.enum(DB_SSL_MODES).optional(),
  // PEM CA certificate for DATABASE_SSL=require (e.g. Supabase's root CA).
  DATABASE_SSL_CA: z.string().optional(),
  // Connections per process; default 1 on Vercel, 10 elsewhere.
  DATABASE_POOL_MAX: z.coerce.number().int().positive().max(100).optional(),
  // Set by Vercel at build and run time ("1").
  VERCEL: z.string().optional(),
  TEST_DATABASE_URL: z.url().optional(),
  // Integration tests use database leetcopy_test_<suffix>; defaults to the git
  // worktree directory name so parallel worktrees never share a test DB.
  TEST_DB_SUFFIX: z.string().optional(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  AUTH_URL: z.url().default("http://localhost:3000"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  WORKER_CONCURRENCY: int(2),
  WORKER_POLL_MS: int(500),
  STALE_RUNNING_MIN: int(3),
  WALL_CAP_MS: int(30000),
  SANDBOX_IMAGE_PYTHON: z.string().min(1).default("lemmayard-sandbox-python:latest"),
  SANDBOX_IMAGE_NODE: z.string().min(1).default("lemmayard-sandbox-node:latest"),
  LANG_TIME_MULT_PY: z.coerce.number().positive().default(2),
  LANG_TIME_MULT_JS: z.coerce.number().positive().default(1),
  RUN_RATE_PER_MIN: int(10),
  SUBMIT_RATE_PER_MIN: int(5),
  MAX_ACTIVE_PER_USER: int(2),
  MAX_CODE_BYTES: int(65536),
  PAGE_SIZE: int(20),
  QUEUED_TIMEOUT_MS: int(60000),
});

export type Env = z.infer<typeof envSchema>;

/** Parses an env-like record; throws a readable error listing every invalid variable. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  // Empty strings (e.g. `FOO=` in .env) mean "unset" so defaults apply.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ""),
  );
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Validated server env. Parsed lazily on first use so importing this module never throws. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
