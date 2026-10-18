// `pnpm worker`: the judge worker process (runs on the host, PLAN.md
// section 3). Prepares the sandbox (orphaned containers, images), then claims
// queued submissions and judges them in Docker. SIGINT/SIGTERM: stop claiming,
// give running jobs a short grace period, then mark the rest internal_error and
// remove this worker's containers.
import { existsSync } from "node:fs";
import { hostname } from "node:os";
import { randomBytes } from "node:crypto";

import { createDb } from "@/server/db";
import { getEnv } from "@/server/env";

import {
  createDockerExecutor,
  dockerConfigFromEnv,
  prepareSandbox,
  removeContainers,
  SandboxSetupError,
} from "./docker-executor";
import { jsonLogger as log, safeErrorMessage, SHUTDOWN_ERROR_TEXT, startWorker } from "./loop";
import { finalizeInternalError } from "./queue";

const SHUTDOWN_GRACE_MS = 10_000;
const SETTLE_MS = 5_000;

const timeout = (ms: number) => new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms).unref());

async function main(): Promise<number> {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const env = getEnv();
  const workerId = `${hostname()}-${process.pid}-${randomBytes(3).toString("hex")}`;
  const workerLabel = `lemmayard.worker=${workerId}`;
  const dockerConfig = { ...dockerConfigFromEnv(env), labels: [workerLabel] };

  try {
    const { removed } = await prepareSandbox(dockerConfig);
    log({ level: "info", msg: "sandbox ready", workerId, namespace: dockerConfig.namespace, removedOrphans: removed });
  } catch (error) {
    if (error instanceof SandboxSetupError) {
      console.error(`worker: ${error.message}`);
      return 1;
    }
    throw error;
  }

  const { db, pool } = createDb(env.DATABASE_URL);
  const handle = startWorker({
    db,
    executor: createDockerExecutor(dockerConfig),
    workerId,
    concurrency: env.WORKER_CONCURRENCY,
    pollMs: env.WORKER_POLL_MS,
    staleMin: env.STALE_RUNNING_MIN,
  });
  log({
    level: "info",
    msg: "worker started",
    workerId,
    concurrency: env.WORKER_CONCURRENCY,
    pollMs: env.WORKER_POLL_MS,
  });

  const signal = await new Promise<NodeJS.Signals>((resolve) => {
    process.once("SIGINT", () => resolve("SIGINT"));
    process.once("SIGTERM", () => resolve("SIGTERM"));
  });
  log({ level: "info", msg: "shutting down", workerId, signal, active: handle.active().length });
  // A second signal skips the grace period.
  const forced = new Promise<"forced">((resolve) => {
    process.once("SIGINT", () => resolve("forced"));
    process.once("SIGTERM", () => resolve("forced"));
  });

  const stopped = handle.stop();
  const outcome = await Promise.race([stopped.then(() => "done" as const), timeout(SHUTDOWN_GRACE_MS), forced]);
  if (outcome !== "done") {
    const ids = handle.active();
    try {
      const marked = await finalizeInternalError(db, ids, SHUTDOWN_ERROR_TEXT);
      log({ level: "warn", msg: "unfinished jobs marked internal_error", workerId, submissionIds: marked });
    } catch (error) {
      log({ level: "error", msg: "could not mark unfinished jobs", workerId, reason: safeErrorMessage(error) });
    }
    try {
      const removed = await removeContainers(dockerConfig, workerLabel);
      log({ level: "warn", msg: "removed worker containers", workerId, removed });
    } catch (error) {
      log({ level: "error", msg: "could not remove containers", workerId, reason: safeErrorMessage(error) });
    }
    await Promise.race([stopped, timeout(SETTLE_MS)]);
  }
  await pool.end();
  log({ level: "info", msg: "worker stopped", workerId });
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error("worker failed:", safeErrorMessage(error));
    process.exit(1);
  },
);
