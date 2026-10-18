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
  SANDBOX_IMAGE_JAVA: z.string().min(1).default("lemmayard-sandbox-java:latest"),
  // Label lemmayard.ns=<value> on every sandbox container; the worker's
  // start-up cleanup only removes containers of its own namespace. Unset: the
  // checkout's directory name + a path hash (worker/docker-executor.ts).
  SANDBOX_NAMESPACE: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/, "letters, digits, _ . - (max 64), starting with a letter or digit")
    .optional(),
  LANG_TIME_MULT_PY: z.coerce.number().positive().default(2),
  LANG_TIME_MULT_JS: z.coerce.number().positive().default(1),
  // Java: per-test time excludes JVM start-up and compilation (they get a
  // separate wall-clock allowance), but includes JIT warm-up of the first calls.
  LANG_TIME_MULT_JAVA: z.coerce.number().positive().default(2),
  RUN_RATE_PER_MIN: int(10),
  SUBMIT_RATE_PER_MIN: int(5),
  MAX_ACTIVE_PER_USER: int(2),
  MAX_CODE_BYTES: int(65536),
  PAGE_SIZE: int(20),
  QUEUED_TIMEOUT_MS: int(60000),
  // Guide (/learn): "1" enables the /learn/dev-fixtures pages used by Playwright.
  GUIDE_FIXTURES: z.enum(["0", "1"]).default("0"),
  // Code execution (Run / Submit / room sessions): "1" on, "0" off. Unset: on,
  // except on Vercel with the docker executor (no worker there). See isJudgeEnabled().
  JUDGE_ENABLED: z.enum(["0", "1"]).optional(),
  // Who runs user code (docs/specs/judge-prod.md): "docker" = the `pnpm worker`
  // process with Docker (local dev, CI, a worker host); "vercel-sandbox" = the
  // web app itself judges queued submissions in Vercel Sandbox microVMs.
  JUDGE_EXECUTOR: z.enum(["docker", "vercel-sandbox"]).default("docker"),
  // Vercel Sandbox images for JUDGE_EXECUTOR=vercel-sandbox (managed images).
  VERCEL_SANDBOX_IMAGE_PYTHON: z.string().min(1).default("vercel/sandbox/python:3.14"),
  VERCEL_SANDBOX_IMAGE_NODE: z.string().min(1).default("vercel/sandbox/node:22"),
  // Java has no managed image: the owner pushes sandbox/Dockerfile.java to the
  // team's registry once (docs/specs/judge-prod.md, "Adding a language").
  VERCEL_SANDBOX_IMAGE_JAVA: z.string().min(1).default("lemmayard-java:1"),
  // Login/register rate limits (src/server/auth/rate-limit.ts). "0" only for
  // local Playwright runs, which register many users from one address;
  // rejected on Vercel.
  AUTH_RATE_LIMITS: z.enum(["0", "1"]).default("1"),
  // Study plans (community C2, docs/specs/community.md §B.8): "1" shows /plans,
  // the nav item and the add-to-plan buttons; "0" (default) hides them and
  // every /api/plans route answers 404. Independent of COMMUNITY_ENABLED.
  PLANS_ENABLED: z.enum(["0", "1"]).default("0"),
}).superRefine((env, ctx) => {
  if (env.VERCEL && env.AUTH_RATE_LIMITS === "0") {
    ctx.addIssue({ code: "custom", path: ["AUTH_RATE_LIMITS"], message: "must not be 0 on Vercel" });
  }
  if (deployedProduction(env)) {
    const problem = weakSecretReason(env.AUTH_SECRET);
    if (problem) {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_SECRET"],
        message: `${problem}; generate one with \`openssl rand -base64 32\``,
      });
    }
  }
});

/** The AUTH_SECRET value shipped in .env.example. */
export const AUTH_SECRET_PLACEHOLDER = "change-me-to-a-random-string-of-32-chars-or-more";
const MIN_DISTINCT_SECRET_CHARS = 12;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Production build served to real users: on Vercel, or `NODE_ENV=production`
 * with a non-loopback AUTH_URL. A local `pnpm build && pnpm start` (the
 * Playwright web server) keeps working with the .env.example placeholder.
 */
function deployedProduction(env: { NODE_ENV: string; VERCEL?: string; AUTH_URL: string }): boolean {
  if (env.NODE_ENV !== "production") return false;
  if (env.VERCEL) return true;
  return !LOOPBACK_HOSTS.has(new URL(env.AUTH_URL).hostname);
}

/** Why `secret` is unfit for production, or null. Never includes the value. */
export function weakSecretReason(secret: string): string | null {
  if (secret === AUTH_SECRET_PLACEHOLDER) return "is the .env.example placeholder";
  if (/change-?me/i.test(secret)) return 'contains "change-me"';
  if (new Set(secret).size < MIN_DISTINCT_SECRET_CHARS) {
    return `has fewer than ${MIN_DISTINCT_SECRET_CHARS} distinct characters`;
  }
  return null;
}

export type Env = z.infer<typeof envSchema>;

/**
 * Whether this deployment accepts Run / Submit / session starts. An explicit
 * `JUDGE_ENABLED` wins; otherwise enabled unless `VERCEL` is set with the
 * docker executor, so a Vercel deployment without a worker never queues jobs
 * nobody processes. With `JUDGE_EXECUTOR=vercel-sandbox` the app judges itself.
 */
export function isJudgeEnabled(
  env: Pick<Env, "JUDGE_ENABLED" | "VERCEL"> & Partial<Pick<Env, "JUDGE_EXECUTOR">>,
): boolean {
  if (env.JUDGE_ENABLED !== undefined) return env.JUDGE_ENABLED === "1";
  return !env.VERCEL || env.JUDGE_EXECUTOR === "vercel-sandbox";
}

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
