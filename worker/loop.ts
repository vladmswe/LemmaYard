// The worker loop: `concurrency` slots, each claims and processes one
// submission at a time; a sweep runs at start and every `sweepIntervalMs`.
// A failure while processing one job finalizes it as `internal_error` and the
// loop keeps going (PLAN.md section 9).
import { DrizzleQueryError } from "drizzle-orm/errors";

import type { Db } from "@/server/db";
import { sweepRoomSessions } from "@/server/rooms/lifecycle";

import {
  buildJob,
  claimNext,
  finalize,
  finalizeInternalError,
  JobBuildError,
  sweep,
  toFinalFields,
  type Submission,
} from "./queue";
import type { Executor } from "./types";

/** One structured log line. Never carries user code, stdout or user error text. */
export type LogEntry = { level: "info" | "warn" | "error"; msg: string } & Record<string, unknown>;
export type Logger = (entry: LogEntry) => void;

export const jsonLogger: Logger = (entry) => {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  if (entry.level === "info") process.stdout.write(`${line}\n`);
  else process.stderr.write(`${line}\n`);
};

/**
 * Error text that is safe to log: Drizzle query errors carry the SQL params
 * (user code, stdout), so only the driver's message is kept.
 */
export function safeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error).slice(0, 300);
  let message = error.message;
  if (error instanceof DrizzleQueryError || message.startsWith("Failed query")) {
    message = error.cause instanceof Error ? `database: ${error.cause.message}` : "database query failed";
  }
  return message.split("\n")[0].slice(0, 300);
}

export const INTERNAL_ERROR_TEXT = "internal error: the judge failed to process this submission";
export const SHUTDOWN_ERROR_TEXT = "internal error: the judge shut down while running this submission";

export type WorkerOptions = {
  db: Db;
  executor: Executor;
  workerId: string;
  concurrency: number;
  pollMs: number;
  staleMin: number;
  sweepIntervalMs?: number;
  log?: Logger;
};

export type WorkerHandle = {
  /** Submission ids being processed right now. */
  active(): string[];
  /** Stops claiming and resolves when every slot has finished its current job. */
  stop(): Promise<void>;
  /** Resolves when all slots have exited (after `stop()`). */
  done: Promise<void>;
};

/** Processes one claimed submission end to end. Never throws. */
export async function processSubmission(
  db: Db,
  executor: Executor,
  submission: Submission,
  log: Logger,
  workerId: string,
): Promise<void> {
  const started = performance.now();
  const meta = {
    workerId,
    submissionId: submission.id,
    kind: submission.kind,
    language: submission.language,
  };
  try {
    const job = await buildJob(db, submission);
    const result = await executor(job);
    const fields = toFinalFields(submission.kind, result);
    const written = await finalize(db, submission.id, fields);
    log({
      level: "info",
      msg: written ? "judged" : "result discarded (no longer running)",
      ...meta,
      verdict: result.status,
      passed: fields.passedCount,
      total: fields.totalCount,
      durationMs: Math.round(performance.now() - started),
      // The executor's own failure reason (Docker, frames); never user text.
      ...(result.status === "internal_error" ? { reason: result.error } : {}),
    });
  } catch (error) {
    log({
      level: "error",
      msg: "processing failed",
      ...meta,
      reason: error instanceof JobBuildError ? error.message : safeErrorMessage(error),
      durationMs: Math.round(performance.now() - started),
    });
    try {
      await finalizeInternalError(db, [submission.id], INTERNAL_ERROR_TEXT);
    } catch (inner) {
      // The stale sweep finalizes it later.
      log({ level: "error", msg: "could not mark internal_error", ...meta, reason: safeErrorMessage(inner) });
    }
  }
}

/**
 * One sweep: stale `running` rows → `internal_error`, old Run rows deleted,
 * then the rooms backstop. Never throws; failures are logged.
 */
export async function sweepOnce(db: Db, staleMin: number, workerId: string, log: Logger): Promise<void> {
  try {
    const { stale, deletedRuns } = await sweep(db, staleMin);
    if (stale.length > 0 || deletedRuns > 0) {
      log({ level: "warn", msg: "sweep", workerId, staleIds: stale, deletedRuns });
    }
  } catch (error) {
    log({ level: "error", msg: "sweep failed", workerId, reason: safeErrorMessage(error) });
  }
  // Rooms backstop for the lazy close (docs/specs/rooms.md §7.3): expired
  // live sessions → finished, stale lobbies → cancelled.
  try {
    const { expired, stale, rated } = await sweepRoomSessions(db);
    if (expired.length > 0 || stale.length > 0 || rated.length > 0) {
      log({
        level: "info",
        msg: "room sessions closed",
        workerId,
        expired: expired.length,
        stale: stale.length,
        rated: rated.length,
      });
    }
  } catch (error) {
    log({ level: "error", msg: "room session sweep failed", workerId, reason: safeErrorMessage(error) });
  }
}

export function startWorker(options: WorkerOptions): WorkerHandle {
  const { db, executor, workerId, concurrency, pollMs, staleMin } = options;
  const log = options.log ?? jsonLogger;
  const sweepIntervalMs = options.sweepIntervalMs ?? 30_000;
  const active = new Set<string>();
  let stopping = false;
  const wakers = new Set<() => void>();

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      if (stopping) return resolve();
      const done = () => {
        clearTimeout(timer);
        wakers.delete(done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      wakers.add(done);
    });

  const runSweep = () => sweepOnce(db, staleMin, workerId, log);

  const sweeper = (async () => {
    while (!stopping) {
      await runSweep();
      await sleep(sweepIntervalMs);
    }
  })();

  const slot = async () => {
    while (!stopping) {
      let submission: Submission | null = null;
      try {
        submission = await claimNext(db, workerId);
      } catch (error) {
        log({ level: "error", msg: "claim failed", workerId, reason: safeErrorMessage(error) });
      }
      if (!submission) {
        await sleep(pollMs);
        continue;
      }
      active.add(submission.id);
      try {
        await processSubmission(db, executor, submission, log, workerId);
      } finally {
        active.delete(submission.id);
      }
    }
  };

  const done = Promise.all([sweeper, ...Array.from({ length: concurrency }, slot)]).then(() => {});

  return {
    active: () => [...active],
    stop() {
      stopping = true;
      for (const wake of [...wakers]) wake();
      return done;
    },
    done,
  };
}

export type DrainOptions = {
  db: Db;
  executor: Executor;
  workerId: string;
  staleMin: number;
  /** Claim new submissions only while less than this much time has passed. */
  claimWindowMs: number;
  /** Run the sweep first (callers throttle it). */
  sweepFirst: boolean;
  log?: Logger;
};

/**
 * Serverless counterpart of one worker slot (docs/specs/judge-prod.md): claims
 * and processes queued submissions one by one until the queue is empty or the
 * claim window is over, with the same claim / finalize / sweep semantics as
 * `startWorker`. Returns how many submissions it processed. Never throws.
 */
export async function drainQueue(options: DrainOptions): Promise<number> {
  const { db, executor, workerId, staleMin, claimWindowMs } = options;
  const log = options.log ?? jsonLogger;
  const started = performance.now();
  if (options.sweepFirst) await sweepOnce(db, staleMin, workerId, log);
  let processed = 0;
  while (performance.now() - started < claimWindowMs) {
    let submission: Submission | null = null;
    try {
      submission = await claimNext(db, workerId);
    } catch (error) {
      log({ level: "error", msg: "claim failed", workerId, reason: safeErrorMessage(error) });
    }
    if (!submission) break;
    await processSubmission(db, executor, submission, log, workerId);
    processed += 1;
  }
  return processed;
}
