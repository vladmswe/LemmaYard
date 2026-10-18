// E2E harness (Playwright global setup, AC-M7-1): fresh database, production
// build, `next start` and, for the main suite, the real judge worker, all
// against `leetcopy_e2e_<suffix>`. The returned function is the global
// teardown: it stops what it started (by PID) and drops the database.
//
// Playwright's own `webServer` starts before global setup, so it cannot wait
// for the database; this harness owns the whole order instead:
//   1. preflight (port free; Docker + sandbox images when the judge is on)
//   2. DROP/CREATE the database, migrate, import problems/
//   3. `pnpm build` (skipped with E2E_SKIP_BUILD=1 when a build exists)
//   4. `next start` → wait for /api/health = 200
//   5. `tsx worker/index.ts` → wait for its "worker started" log line
// Server and worker output goes to node_modules/.cache/e2e/<variant>-*.log.
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";

import pg from "pg";

import { defaultSandboxNamespace, namespaceFilterArgs } from "../../worker/docker-executor";
import { withDatabase } from "../helpers/test-db-name";

import { E2E_DB_PREFIX, type E2eSettings } from "./env";

const LOG_DIR = path.join(process.cwd(), "node_modules/.cache/e2e");
const SERVER_READY_MS = 120_000;
const WORKER_READY_MS = 60_000;

type Started = { name: string; child: ChildProcess; logFile: string };

const log = (msg: string) => console.log(`[e2e] ${msg}`);

function run(cmd: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs = 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { env, encoding: "utf8", timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(`${path.basename(cmd)} ${args.join(" ")} failed:\n${(stderr || stdout || error.message).trim()}`));
      else resolve(stdout);
    });
  });
}

/** Like `run`, but streams output to this terminal (the build takes a while). */
function runVisible(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${args.join(" ")} exited with ${code}`))));
  });
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "localhost" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function healthy(baseURL: string): Promise<boolean> {
  try {
    return (await fetch(`${baseURL}/api/health`, { signal: AbortSignal.timeout(5000) })).status === 200;
  } catch {
    return false;
  }
}

function tail(file: string, lines = 40): string {
  try {
    return readFileSync(file, "utf8").trimEnd().split("\n").slice(-lines).join("\n");
  } catch {
    return "(no output)";
  }
}

function start(name: string, args: string[], env: NodeJS.ProcessEnv, settings: E2eSettings): Started {
  mkdirSync(LOG_DIR, { recursive: true });
  const logFile = path.join(LOG_DIR, `${settings.variant}-${name}.log`);
  const out = createWriteStream(logFile);
  const child = spawn(process.execPath, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout?.pipe(out);
  child.stderr?.pipe(out);
  return { name, child, logFile };
}

/** Resolves once `ready()` is true; rejects if the process exits first or on timeout. */
async function waitFor(proc: Started, ready: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc.child.exitCode !== null || proc.child.signalCode !== null) {
      throw new Error(`${proc.name} exited during start-up (code ${proc.child.exitCode}). Last output (${proc.logFile}):\n${tail(proc.logFile)}`);
    }
    if (await ready()) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${proc.name} not ready after ${timeoutMs / 1000}s. Last output (${proc.logFile}):\n${tail(proc.logFile)}`);
}

async function stop(proc: Started, graceMs: number): Promise<void> {
  const { child } = proc;
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), graceMs);
  await exited;
  clearTimeout(timer);
}

async function withAdmin<T>(databaseUrl: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: withDatabase(databaseUrl, "postgres") });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function assertE2eName(name: string): void {
  // The name is interpolated into DDL: it must be one of ours and [a-z0-9_].
  if (!name.startsWith(E2E_DB_PREFIX) || !/^[a-z0-9_]+$/.test(name)) throw new Error(`refusing database name "${name}"`);
}

async function recreateDatabase(settings: E2eSettings): Promise<void> {
  assertE2eName(settings.dbName);
  await withAdmin(settings.databaseUrl, async (client) => {
    await client.query(`DROP DATABASE IF EXISTS "${settings.dbName}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${settings.dbName}"`);
  });
}

async function dropDatabase(settings: E2eSettings): Promise<void> {
  assertE2eName(settings.dbName);
  await withAdmin(settings.databaseUrl, (client) => client.query(`DROP DATABASE IF EXISTS "${settings.dbName}" WITH (FORCE)`));
}

function sandboxImages(): string[] {
  return [
    process.env.SANDBOX_IMAGE_PYTHON || "lemmayard-sandbox-python:latest",
    process.env.SANDBOX_IMAGE_NODE || "lemmayard-sandbox-node:latest",
  ];
}

/** Judged specs need Docker and both images: fail now with a clear message, never skip. */
async function dockerPreflight(): Promise<void> {
  try {
    await run("docker", ["version", "--format", "{{.Server.Version}}"], process.env, 20_000);
  } catch (error) {
    throw new Error(
      `e2e: Docker is not available, but the judged specs need it (${(error as Error).message.split("\n").slice(-1)[0]}).\n` +
        "Start Docker, or run without the judge: E2E_JUDGE=0 pnpm test:e2e (judged specs are then skipped).",
    );
  }
  for (const image of sandboxImages()) {
    try {
      await run("docker", ["image", "inspect", "--format", "{{.Id}}", image], process.env, 20_000);
    } catch {
      throw new Error(`e2e: sandbox image "${image}" not found. Build the images with: pnpm sandbox:build`);
    }
  }
}

export function e2eSandboxNamespace(): string {
  return `${process.env.SANDBOX_NAMESPACE || defaultSandboxNamespace()}-e2e`;
}

async function sandboxLeftovers(namespace: string): Promise<string[]> {
  const out = await run("docker", ["ps", "-a", ...namespaceFilterArgs(namespace), "-q"], process.env, 20_000);
  return out.split("\n").filter(Boolean);
}

export async function startHarness(settings: E2eSettings): Promise<() => Promise<void>> {
  const started: Started[] = [];
  const namespace = e2eSandboxNamespace();
  // Hard exit of the runner (Ctrl+C twice): never leave the servers behind.
  const killAll = () => started.forEach((p) => p.child.kill("SIGKILL"));
  process.once("exit", killAll);

  if (process.env.E2E_REUSE_SERVER === "1" && (await healthy(settings.baseURL))) {
    log(`E2E_REUSE_SERVER=1: using the server already on ${settings.baseURL}; no database reset, build, or worker.`);
    return async () => {};
  }
  if (await portInUse(settings.port)) {
    throw new Error(
      `e2e: port ${settings.port} is already in use. Stop that process, pick another port with E2E_PORT, ` +
        "or set E2E_REUSE_SERVER=1 to test the running server (it must use the e2e database).",
    );
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: settings.databaseUrl,
    DATABASE_URL_DIRECT: settings.databaseUrl,
    PORT: String(settings.port),
    AUTH_URL: settings.baseURL,
    // Specs register many users from one address; the limits have their own
    // integration tests (tests/integration/auth-rate-limit.test.ts).
    AUTH_RATE_LIMITS: "0",
    JUDGE_ENABLED: settings.variant === "main" ? "1" : "0",
    GUIDE_FIXTURES: settings.variant === "main" ? "1" : "0",
    WORKER_POLL_MS: process.env.E2E_WORKER_POLL_MS || "100",
    WORKER_CONCURRENCY: process.env.E2E_WORKER_CONCURRENCY || "2",
    SANDBOX_NAMESPACE: namespace,
  };
  const tsxCli = createRequire(path.join(process.cwd(), "package.json")).resolve("tsx/cli");
  const t0 = Date.now();
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

  try {
    if (settings.judge) await dockerPreflight();

    await recreateDatabase(settings);
    await run(process.execPath, [tsxCli, "scripts/db-migrate.ts"], env, 120_000);
    await run(process.execPath, [tsxCli, "scripts/import-problems.ts"], env, 120_000);
    log(`database ${settings.dbName} migrated and seeded (${elapsed()})`);

    if (process.env.E2E_SKIP_BUILD === "1") {
      if (!existsSync(".next/BUILD_ID")) throw new Error("e2e: E2E_SKIP_BUILD=1 but there is no build in .next; run pnpm build");
      log("E2E_SKIP_BUILD=1: serving the existing .next build");
    } else {
      log("building (pnpm build)…");
      await runVisible(process.execPath, ["scripts/next.mjs", "build"], env);
      log(`build done (${elapsed()})`);
    }

    const web = start("web", ["scripts/next.mjs", "start"], env, settings);
    started.push(web);
    await waitFor(web, () => healthy(settings.baseURL), SERVER_READY_MS);
    log(`web server ready on ${settings.baseURL} (pid ${web.child.pid}, ${elapsed()})`);

    if (settings.judge) {
      const worker = start("worker", [tsxCli, "worker/index.ts"], env, settings);
      started.push(worker);
      let ready = false;
      let seen = "";
      worker.child.stdout?.on("data", (chunk: Buffer) => {
        if (ready) return;
        seen = (seen + chunk.toString("utf8")).slice(-4096); // a line may span chunks
        ready = seen.includes('"msg":"worker started"');
      });
      await waitFor(worker, async () => ready, WORKER_READY_MS);
      log(`judge worker ready (pid ${worker.child.pid}, sandbox namespace ${namespace}, ${elapsed()})`);
    } else if (settings.variant === "main") {
      log("E2E_JUDGE=0: no judge worker; judged specs are skipped");
    }
  } catch (error) {
    for (const proc of started.reverse()) await stop(proc, 5000);
    await dropDatabase(settings).catch(() => {});
    throw error;
  }

  return async () => {
    // Worker first: it finishes or marks its jobs before the web server goes.
    for (const proc of [...started].reverse()) await stop(proc, proc.name === "worker" ? 25_000 : 15_000);
    process.removeListener("exit", killAll);
    if (settings.judge) {
      const left = await sandboxLeftovers(namespace).catch(() => []);
      if (left.length > 0) {
        await run("docker", ["rm", "-f", ...left], process.env).catch(() => {});
        console.warn(`[e2e] removed ${left.length} leftover sandbox container(s) of namespace ${namespace}`);
      }
    }
    if (process.env.E2E_KEEP_DB === "1") log(`E2E_KEEP_DB=1: keeping database ${settings.dbName}`);
    else await dropDatabase(settings);
    log(`stopped; logs in ${path.relative(process.cwd(), LOG_DIR)}`);
  };
}
