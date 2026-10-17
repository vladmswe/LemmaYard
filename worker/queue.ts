// Submission queue on the `submissions` table (PLAN.md sections 3 and 4,
// AC-M4-4): atomic claim with `FOR UPDATE SKIP LOCKED`, finalize guarded by
// `status = 'running'`, stale sweep (never requeues) and Run cleanup.
import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import { compareSchema, signatureSchema } from "@/lib/problems/schema";
import { validateInput } from "@/lib/types";
import type { Db } from "@/server/db";
import { problems, submissions, testCases } from "@/server/db/schema";
import { applySessionOutcome } from "@/server/rooms/outcome";

import { sanitizeText, sanitizeValue } from "./judge";
import type { ExecJob, ExecResult, ExecStatus } from "./types";

export type Submission = typeof submissions.$inferSelect;

export const STALE_ERROR = "worker crashed or timed out";
/** Run rows are deleted after this age (AC-M5-11). */
export const RUN_RETENTION_HOURS = 24;

/**
 * Claims the oldest queued submission: sets `running`, `started_at`,
 * `worker_id` in one statement. Concurrent claimers never get the same row.
 */
export async function claimNext(db: Db, workerId: string): Promise<Submission | null> {
  const next = db
    .select({ id: submissions.id })
    .from(submissions)
    .where(eq(submissions.status, "queued"))
    .orderBy(asc(submissions.createdAt))
    .limit(1)
    .for("update", { skipLocked: true });
  const rows = await db
    .update(submissions)
    .set({ status: "running", startedAt: sql`now()`, workerId })
    .where(sql`${submissions.id} = (${next})`)
    .returning();
  return rows[0] ?? null;
}

/** The final columns written for a finished submission. */
export type FinalFields = {
  status: ExecStatus;
  runtimeMs: number | null;
  memoryKb: number | null;
  passedCount: number;
  totalCount: number;
  failedTestIndex: number | null;
  failedCase: Submission["failedCase"];
  caseResults: Submission["caseResults"];
  stdout: string | null;
  error: string | null;
};

/**
 * Writes the final result, only if the row is still `running` (a stale sweep
 * or a shutdown may have finalized it already). Returns whether it was written.
 *
 * Rooms (docs/specs/rooms.md §3.4): a submission without a room session keeps
 * the one-statement path. A session submit is finalized in a transaction
 * that also applies the session outcome (results row, participant totals,
 * ranks, `problem_solved` / `attempt_failed` event) under the session's
 * advisory lock, so verdict and score commit together and event ids follow
 * commit order. Every executor must finalize through this function.
 */
export async function finalize(db: Db, id: string, fields: FinalFields): Promise<boolean> {
  const plain = await db
    .update(submissions)
    .set({ ...fields, finishedAt: sql`now()` })
    .where(and(eq(submissions.id, id), eq(submissions.status, "running"), isNull(submissions.roomSessionId)))
    .returning({ id: submissions.id });
  if (plain.length === 1) return true;

  return db.transaction(async (tx) => {
    const rows = await tx
      .update(submissions)
      .set({ ...fields, finishedAt: sql`now()` })
      .where(and(eq(submissions.id, id), eq(submissions.status, "running")))
      .returning({
        id: submissions.id,
        kind: submissions.kind,
        userId: submissions.userId,
        problemId: submissions.problemId,
        roomSessionId: submissions.roomSessionId,
      });
    const row = rows[0];
    // Already finalized (sweep, shutdown, a second call): nothing else happens.
    if (!row) return false;
    if (row.kind === "submit" && row.roomSessionId !== null) {
      await applySessionOutcome(tx, {
        sessionId: row.roomSessionId,
        userId: row.userId,
        problemId: row.problemId,
        submissionId: row.id,
      });
    }
    return true;
  });
}

/** `internal_error` with no metrics; counters are kept as they are. */
export async function finalizeInternalError(
  db: Db,
  ids: string[],
  error: string,
): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .update(submissions)
    .set({ status: "internal_error", error, finishedAt: sql`now()` })
    .where(and(inArray(submissions.id, ids), eq(submissions.status, "running")))
    .returning({ id: submissions.id });
  return rows.map((r) => r.id);
}

export type SweepResult = { stale: string[]; deletedRuns: number };

/**
 * `running` rows started more than `staleMin` minutes ago → `internal_error`
 * (never requeued); `kind = 'run'` rows older than 24 h are deleted.
 */
export async function sweep(db: Db, staleMin: number): Promise<SweepResult> {
  const stale = await db
    .update(submissions)
    .set({ status: "internal_error", error: STALE_ERROR, finishedAt: sql`now()` })
    .where(
      and(
        eq(submissions.status, "running"),
        lt(submissions.startedAt, sql`now() - make_interval(mins => ${staleMin})`),
      ),
    )
    .returning({ id: submissions.id });
  const deleted = await db
    .delete(submissions)
    .where(
      and(
        eq(submissions.kind, "run"),
        lt(submissions.createdAt, sql`now() - make_interval(hours => ${RUN_RETENTION_HOURS})`),
      ),
    )
    .returning({ id: submissions.id });
  return { stale: stale.map((r) => r.id), deletedRuns: deleted.length };
}

/** Thrown when a submission cannot be turned into a job (bad data in the DB). */
export class JobBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobBuildError";
  }
}

/**
 * Builds the executor job: Submit = every test with expected, stop at the
 * first failure; Run = every sample test without stopping, or one custom-input
 * case without expected.
 */
export async function buildJob(db: Db, submission: Submission): Promise<ExecJob> {
  const [problem] = await db
    .select({
      signature: problems.signature,
      compare: problems.compare,
      timeLimitMs: problems.timeLimitMs,
      memoryLimitMb: problems.memoryLimitMb,
    })
    .from(problems)
    .where(eq(problems.id, submission.problemId));
  if (!problem) throw new JobBuildError("problem not found");
  const signature = signatureSchema.safeParse(problem.signature);
  const compare = compareSchema.safeParse(problem.compare);
  if (!signature.success || !compare.success) throw new JobBuildError("invalid problem signature or compare");

  const base = {
    language: submission.language,
    code: submission.code,
    signature: signature.data,
    compare: compare.data,
    limits: { timeMs: problem.timeLimitMs, memoryMb: problem.memoryLimitMb },
  };

  if (submission.kind === "run" && submission.customInput != null) {
    if (validateInput(submission.customInput, signature.data).length > 0) {
      throw new JobBuildError("custom input does not match the signature");
    }
    return { ...base, tests: [{ input: submission.customInput }], stopOnFirstFailure: false };
  }

  const isRun = submission.kind === "run";
  const rows = await db
    .select({ input: testCases.input, expected: testCases.expected })
    .from(testCases)
    .where(
      isRun
        ? and(eq(testCases.problemId, submission.problemId), eq(testCases.isSample, true))
        : eq(testCases.problemId, submission.problemId),
    )
    .orderBy(asc(testCases.position));
  if (rows.length === 0) throw new JobBuildError("problem has no tests");
  return {
    ...base,
    tests: rows.map((r) => ({ input: r.input, expected: r.expected })),
    stopOnFirstFailure: !isRun,
  };
}

const metric = (n: number | null) => (n === null || !Number.isFinite(n) ? null : Math.max(0, Math.round(n)));

/**
 * Maps an executor result onto the submission columns (sanitized again for
 * Postgres, see `sanitizeValue`; the DockerExecutor already does it). `failed_case` only for
 * Submit + wrong_answer, `case_results` only for Run; counters per PLAN.md
 * section 4 (`total_count` = cases of the job).
 */
export function toFinalFields(kind: Submission["kind"], result: ExecResult): FinalFields {
  const totalCount = result.totalCount;
  const passedCount = Math.min(Math.max(0, result.passedCount), totalCount);
  const index = result.failedTestIndex;
  return {
    status: result.status,
    runtimeMs: metric(result.runtimeMs),
    memoryKb: metric(result.memoryKb),
    passedCount,
    totalCount,
    failedTestIndex:
      index !== null && Number.isInteger(index) && index >= 0 && index < totalCount ? index : null,
    failedCase:
      kind === "submit" && result.status === "wrong_answer" && result.failedCase
        ? sanitizeValue(result.failedCase)
        : null,
    caseResults: kind === "run" ? sanitizeValue(result.caseResults) : null,
    stdout: sanitizeText(result.stdout),
    error: result.error === null ? null : sanitizeText(result.error),
  };
}
