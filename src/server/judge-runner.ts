// In-app judging for JUDGE_EXECUTOR=vercel-sandbox (docs/specs/judge-prod.md).
// There is no long-lived worker on Vercel: after a Run/Submit is queued, and
// whenever its owner polls a submission that waits, the route schedules a
// drain with `after()`. The drain claims rows exactly like `pnpm worker`
// (FOR UPDATE SKIP LOCKED, finalize only WHERE status='running', stale sweep),
// so parallel function instances never judge one submission twice.
import { randomBytes } from "node:crypto";

import { after } from "next/server";

import { drainQueue } from "../../worker/loop";
import type { Executor } from "../../worker/types";
import { vercelSandboxClient } from "../../worker/vercel-sandbox-client";
import { createVercelSandboxExecutor } from "../../worker/vercel-sandbox-executor";

import { getDb } from "@/server/db";
import { getEnv, isJudgeEnabled } from "@/server/env";

/**
 * New claims stop after this; a claimed job then needs at most the wall
 * budget (≤ 33 s) plus VM start/stop, far inside the 300 s function limit.
 */
export const CLAIM_WINDOW_MS = 120_000;
/** The sweep (stale rows, old Runs, room sessions) runs at most this often per instance. */
export const SWEEP_EVERY_MS = 30_000;
/** Same, when a poll sees a row `running` past the stale limit. */
const FORCED_SWEEP_EVERY_MS = 5000;
/** A queued row older than this makes a poll schedule a drain (the POST already did once). */
export const KICK_AFTER_QUEUED_MS = 3000;

const instanceId = `vercel-${randomBytes(4).toString("hex")}`;
let executor: Executor | undefined;
let activeDrains = 0;
let drainSeq = 0;
let lastSweepAt = 0;

function sandboxExecutor(): Executor {
  const env = getEnv();
  executor ??= createVercelSandboxExecutor(
    {
      images: { python: env.VERCEL_SANDBOX_IMAGE_PYTHON, javascript: env.VERCEL_SANDBOX_IMAGE_NODE },
      timeMultPython: env.LANG_TIME_MULT_PY,
      timeMultJs: env.LANG_TIME_MULT_JS,
      wallCapMs: env.WALL_CAP_MS,
    },
    vercelSandboxClient(),
  );
  return executor;
}

/** Whether this process judges submissions itself (JUDGE_EXECUTOR=vercel-sandbox and the judge on). */
export function judgesInProcess(): boolean {
  const env = getEnv();
  return env.JUDGE_EXECUTOR === "vercel-sandbox" && isJudgeEnabled(env);
}

/**
 * Schedules one drain after the current response, if this process judges
 * in-process and has a free slot (`WORKER_CONCURRENCY` drains per instance).
 * Call only from a route handler. A no-op for the docker executor.
 */
export function scheduleJudge(options: { forceSweep?: boolean } = {}): void {
  if (!judgesInProcess()) return;
  const env = getEnv();
  if (activeDrains >= env.WORKER_CONCURRENCY) return;
  activeDrains += 1;
  drainSeq += 1;
  const workerId = `${instanceId}-${drainSeq}`;
  const now = Date.now();
  const sweepFirst = now - lastSweepAt >= (options.forceSweep ? FORCED_SWEEP_EVERY_MS : SWEEP_EVERY_MS);
  if (sweepFirst) lastSweepAt = now;
  after(async () => {
    try {
      await drainQueue({
        db: getDb(),
        executor: sandboxExecutor(),
        workerId,
        staleMin: env.STALE_RUNNING_MIN,
        claimWindowMs: CLAIM_WINDOW_MS,
        sweepFirst,
      });
    } finally {
      activeDrains -= 1;
    }
  });
}

/**
 * Poll side: a submission that still waits (queued for a few seconds, or
 * running past the stale limit) schedules a drain, so a crashed or timed-out
 * function never leaves rows behind for long.
 */
export function scheduleJudgeForWaiting(status: string, createdAt: Date | string): void {
  if (status !== "queued" && status !== "running") return;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  if (status === "queued" && ageMs >= KICK_AFTER_QUEUED_MS) scheduleJudge();
  else if (status === "running" && ageMs >= getEnv().STALE_RUNNING_MIN * 60_000) scheduleJudge({ forceSweep: true });
}
