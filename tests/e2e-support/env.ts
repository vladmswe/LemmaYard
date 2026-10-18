// E2E harness settings, computed the same way in the Playwright main process
// and in every test worker (the config file is evaluated in both), so specs,
// the web server and the judge worker all agree on one isolated database.
//
//   database  leetcopy_e2e_<suffix>[_off]  (suffix: TEST_DB_SUFFIX or the git
//             worktree directory name, like the integration DB), on the
//             TEST_DATABASE_URL server (fallback DATABASE_URL)
//   port      E2E_PORT, default PORT + 1177 (3000 → 4177); judge-off: + 1
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

import { sanitizeSuffix, withDatabase } from "../helpers/test-db-name";

export const E2E_DB_PREFIX = "leetcopy_e2e_";
export const E2E_PORT_OFFSET = 1177;

export type E2eVariant = "main" | "judge-off";

export type E2eSettings = {
  variant: E2eVariant;
  port: number;
  baseURL: string;
  dbName: string;
  databaseUrl: string;
  /** Start the judge worker (main suite only; `E2E_JUDGE=0` opts out). */
  judge: boolean;
};

/** `.env` first; shell variables win (same as scripts/next.mjs). */
export function loadDotEnv(): void {
  if (existsSync(".env")) process.loadEnvFile(".env");
}

function worktreeName(): string {
  try {
    const top = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return path.basename(top);
  } catch {
    return path.basename(process.cwd());
  }
}

const nonEmpty = (v: string | undefined) => (v && v.trim() !== "" ? v : undefined);

export function e2eSettings(variant: E2eVariant): E2eSettings {
  const mainPort = Number(nonEmpty(process.env.E2E_PORT) ?? Number(nonEmpty(process.env.PORT) ?? 3000) + E2E_PORT_OFFSET);
  if (!Number.isInteger(mainPort) || mainPort < 1 || mainPort > 65_534) {
    throw new Error(`E2E_PORT/PORT gives an invalid e2e port (${mainPort})`);
  }
  const port = variant === "main" ? mainPort : mainPort + 1;
  const suffix = sanitizeSuffix(nonEmpty(process.env.TEST_DB_SUFFIX) ?? worktreeName());
  const dbName = `${E2E_DB_PREFIX}${suffix}${variant === "judge-off" ? "_off" : ""}`;
  const server = nonEmpty(process.env.TEST_DATABASE_URL) ?? nonEmpty(process.env.DATABASE_URL);
  if (!server) throw new Error("e2e: set DATABASE_URL (or TEST_DATABASE_URL) in .env; see .env.example");
  return {
    variant,
    port,
    // localhost, not 127.0.0.1: AUTH_URL is compared with the request Origin.
    baseURL: `http://localhost:${port}`,
    dbName,
    databaseUrl: withDatabase(server, dbName),
    judge: variant === "main" && process.env.E2E_JUDGE !== "0",
  };
}

/**
 * Points the test run's own environment at the e2e database, so spec helpers
 * that read `DATABASE_URL` (and the servers the harness spawns) can never
 * reach the database named in `.env`. Idempotent: workers re-evaluate the
 * config with this environment and get the same values.
 */
export function exportToTestEnv(settings: E2eSettings): void {
  process.env.DATABASE_URL = settings.databaseUrl;
  process.env.DATABASE_URL_DIRECT = settings.databaseUrl;
  if (settings.variant === "main") process.env.E2E_PORT = String(settings.port);
}
