// AC-M4-4 / AC-M5-11: the submission queue with a stub executor (no Docker):
// atomic claim under two concurrent worker loops, finalize guard, stale sweep,
// Run cleanup, and the job/result mapping.
import { eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { submissions } from "@/server/db/schema";

import { INTERNAL_ERROR_TEXT, processSubmission, startWorker, type LogEntry } from "../../worker/loop";
import { claimNext, finalize, STALE_ERROR, sweep, toFinalFields } from "../../worker/queue";
import type { ExecJob, ExecResult, Executor } from "../../worker/types";
import {
  closeTestDb,
  createProblem,
  createSubmission,
  createTestCases,
  createUser,
  getTestDb,
  resetTestDb,
} from "../helpers/db";

beforeEach(resetTestDb);
afterAll(closeTestDb);

const FINAL = [
  "accepted",
  "wrong_answer",
  "time_limit",
  "memory_limit",
  "runtime_error",
  "compile_error",
  "internal_error",
];

/** An `accepted` result shaped like the executor's, overridable per test. */
function fakeResult(job: ExecJob, over: Partial<ExecResult> = {}): ExecResult {
  return {
    status: "accepted",
    passedCount: job.tests.length,
    totalCount: job.tests.length,
    runtimeMs: 12,
    memoryKb: 17_000,
    failedTestIndex: null,
    failedCase: null,
    caseResults: job.tests.map((t, index) => ({
      index,
      status: "passed",
      input: t.input,
      ...(Object.hasOwn(t, "expected") ? { expected: t.expected, actual: t.expected } : {}),
      timeMs: 1,
    })),
    stdout: "",
    error: null,
    ...over,
  };
}

const silent = () => {};

async function waitFor(check: () => Promise<boolean>, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 25));
  }
}

async function fixture(testCount = 5) {
  const user = await createUser();
  const problem = await createProblem();
  if (testCount > 0) await createTestCases(problem.id, testCount);
  return { user, problem };
}

async function row(id: string) {
  const [r] = await getTestDb().select().from(submissions).where(eq(submissions.id, id));
  return r;
}

describe("claim", () => {
  it("sets running, started_at and worker_id on the oldest queued row", async () => {
    const { user, problem } = await fixture();
    const first = await createSubmission({ userId: user.id, problemId: problem.id, code: "first" });
    await createSubmission({ userId: user.id, problemId: problem.id, code: "second" });
    const claimed = await claimNext(getTestDb(), "w-1");
    expect(claimed?.id).toBe(first.id);
    expect(claimed?.status).toBe("running");
    expect(claimed?.workerId).toBe("w-1");
    expect(claimed?.startedAt).toBeInstanceOf(Date);
  });

  it("returns null when nothing is queued", async () => {
    expect(await claimNext(getTestDb(), "w-1")).toBeNull();
  });

  it("20 submissions, 2 concurrent worker loops: each executed exactly once, all final", async () => {
    const { user, problem } = await fixture();
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) {
      ids.push((await createSubmission({ userId: user.id, problemId: problem.id, code: `job-${i}` })).id);
    }
    const executions = new Map<string, number>();
    const executor: Executor = async (job) => {
      executions.set(job.code, (executions.get(job.code) ?? 0) + 1);
      await new Promise((r) => setTimeout(r, 5 + Math.random() * 20));
      return fakeResult(job);
    };
    const db = getTestDb();
    const options = { db, executor, concurrency: 2, pollMs: 10, staleMin: 3, log: silent };
    const a = startWorker({ ...options, workerId: "worker-a" });
    const b = startWorker({ ...options, workerId: "worker-b" });
    try {
      await waitFor(async () => (await db.$count(submissions, inArray(submissions.status, ["queued", "running"]))) === 0);
    } finally {
      await Promise.all([a.stop(), b.stop()]);
    }
    expect(executions.size).toBe(20);
    expect([...executions.values()].every((n) => n === 1)).toBe(true);
    const rows = await db.select().from(submissions);
    expect(rows).toHaveLength(20);
    for (const r of rows) {
      expect(r.status).toBe("accepted");
      expect(r.finishedAt).toBeInstanceOf(Date);
      expect(r.startedAt).toBeInstanceOf(Date);
    }
    expect(new Set(rows.map((r) => r.workerId))).toEqual(new Set(["worker-a", "worker-b"]));
  });
});

describe("finalize", () => {
  it("writes only while the row is running", async () => {
    const { user, problem } = await fixture();
    const queued = await createSubmission({ userId: user.id, problemId: problem.id });
    const fields = toFinalFields("submit", fakeResult({ tests: [{ input: { x: 1 } }] } as unknown as ExecJob));
    // Still queued: not claimed, not written.
    expect(await finalize(getTestDb(), queued.id, fields)).toBe(false);
    expect((await row(queued.id)).status).toBe("queued");

    const claimed = await claimNext(getTestDb(), "w-1");
    expect(await finalize(getTestDb(), claimed!.id, fields)).toBe(true);
    const done = await row(queued.id);
    expect(done.status).toBe("accepted");
    expect(done.finishedAt).toBeInstanceOf(Date);
    // Already final: a second (late) write is discarded.
    expect(await finalize(getTestDb(), claimed!.id, { ...fields, status: "wrong_answer" })).toBe(false);
    expect((await row(queued.id)).status).toBe("accepted");
  });

  it("a result arriving after the stale sweep is discarded", async () => {
    const { user, problem } = await fixture();
    const s = await createSubmission({
      userId: user.id,
      problemId: problem.id,
      status: "running",
      startedAt: new Date(Date.now() - 10 * 60_000),
    });
    await sweep(getTestDb(), 3);
    const late = toFinalFields("submit", fakeResult({ tests: [{ input: { x: 1 } }] } as unknown as ExecJob));
    expect(await finalize(getTestDb(), s.id, late)).toBe(false);
    expect((await row(s.id)).status).toBe("internal_error");
  });
});

describe("sweep", () => {
  it("marks running rows older than STALE_RUNNING_MIN internal_error; fresh ones untouched; never requeues", async () => {
    const { user, problem } = await fixture();
    const base = { userId: user.id, problemId: problem.id };
    const stale = await createSubmission({ ...base, status: "running", startedAt: new Date(Date.now() - 10 * 60_000), workerId: "dead" });
    const fresh = await createSubmission({ ...base, status: "running", startedAt: new Date(Date.now() - 60_000), workerId: "alive" });
    const queued = await createSubmission(base);

    const result = await sweep(getTestDb(), 3);
    expect(result.stale).toEqual([stale.id]);

    const s = await row(stale.id);
    expect(s.status).toBe("internal_error");
    expect(s.error).toBe(STALE_ERROR);
    expect(s.finishedAt).toBeInstanceOf(Date);
    const f = await row(fresh.id);
    expect(f.status).toBe("running");
    expect(f.finishedAt).toBeNull();
    expect((await row(queued.id)).status).toBe("queued");

    // A second sweep does not touch the now-final row (no requeue, no rewrite).
    expect((await sweep(getTestDb(), 3)).stale).toEqual([]);
    expect((await row(stale.id)).status).toBe("internal_error");
  });

  it("runs when the worker starts", async () => {
    const { user, problem } = await fixture();
    const stale = await createSubmission({
      userId: user.id,
      problemId: problem.id,
      status: "running",
      startedAt: new Date(Date.now() - 10 * 60_000),
    });
    const w = startWorker({
      db: getTestDb(),
      executor: async (job) => fakeResult(job),
      workerId: "w",
      concurrency: 1,
      pollMs: 10,
      staleMin: 3,
      log: silent,
    });
    try {
      await waitFor(async () => (await row(stale.id)).status === "internal_error");
    } finally {
      await w.stop();
    }
  });

  it("deletes kind=run rows older than 24 h, keeps newer runs and all submits", async () => {
    const { user, problem } = await fixture();
    const base = { userId: user.id, problemId: problem.id };
    const old = new Date(Date.now() - 25 * 3600_000);
    const finished = { status: "accepted" as const, startedAt: old, finishedAt: old };
    const oldRun = await createSubmission({ ...base, kind: "run", createdAt: old, ...finished });
    const newRun = await createSubmission({ ...base, kind: "run", createdAt: new Date(Date.now() - 3600_000), ...finished });
    const oldSubmit = await createSubmission({ ...base, kind: "submit", createdAt: old, ...finished });

    const result = await sweep(getTestDb(), 3);
    expect(result.deletedRuns).toBe(1);
    expect(await row(oldRun.id)).toBeUndefined();
    expect(await row(newRun.id)).toBeDefined();
    expect(await row(oldSubmit.id)).toBeDefined();
  });
});

describe("job and result mapping", () => {
  /** Claims `id` and processes it with `executor`, returning the job it got. */
  async function process(executor: Executor, logs: LogEntry[] = []) {
    const db = getTestDb();
    const claimed = await claimNext(db, "w-map");
    if (!claimed) throw new Error("nothing claimed");
    let seen: ExecJob | undefined;
    await processSubmission(
      db,
      async (job) => {
        seen = job;
        return executor(job);
      },
      claimed,
      (e) => logs.push(e),
      "w-map",
    );
    return { job: seen, saved: await row(claimed.id) };
  }

  it("submit: all tests in position order with expected, stop on first failure; WA stores failed_case and index", async () => {
    const { user, problem } = await fixture(6);
    await createSubmission({ userId: user.id, problemId: problem.id, kind: "submit" });
    const { job, saved } = await process(async (j) =>
      fakeResult(j, {
        status: "wrong_answer",
        passedCount: 2,
        failedTestIndex: 2,
        failedCase: { input: { x: 2 }, expected: 2, actual: 99 },
        stdout: "debug",
      }),
    );
    expect(job?.stopOnFirstFailure).toBe(true);
    expect(job?.tests).toEqual([0, 1, 2, 3, 4, 5].map((i) => ({ input: { x: i }, expected: i })));
    expect(job?.signature.name).toBe("solve");
    expect(job?.limits).toEqual({ timeMs: 2000, memoryMb: 256 });
    expect(saved).toMatchObject({
      status: "wrong_answer",
      passedCount: 2,
      totalCount: 6,
      failedTestIndex: 2,
      failedCase: { input: { x: 2 }, expected: 2, actual: 99 },
      caseResults: null,
      stdout: "debug",
      runtimeMs: 12,
      memoryKb: 17_000,
      error: null,
    });
    expect(saved.finishedAt).toBeInstanceOf(Date);
  });

  it("run: only the sample tests, no stop; case_results stored, no failed_case", async () => {
    const { user, problem } = await fixture(0);
    await createTestCases(problem.id, 6);
    // Make positions 0..2 samples.
    await getTestDb().execute(sql`UPDATE test_cases SET is_sample = (position < 3)`);
    await createSubmission({ userId: user.id, problemId: problem.id, kind: "run" });
    const { job, saved } = await process(async (j) =>
      fakeResult(j, {
        status: "wrong_answer",
        passedCount: 2,
        failedTestIndex: 1,
        failedCase: { input: { x: 1 }, expected: 1, actual: 5 },
      }),
    );
    expect(job?.stopOnFirstFailure).toBe(false);
    expect(job?.tests).toEqual([0, 1, 2].map((i) => ({ input: { x: i }, expected: i })));
    expect(saved.status).toBe("wrong_answer");
    expect(saved.totalCount).toBe(3);
    expect(saved.passedCount).toBe(2);
    expect(saved.failedTestIndex).toBe(1);
    expect(saved.failedCase).toBeNull();
    expect(saved.caseResults).toHaveLength(3);
    expect(saved.caseResults?.[0]).toMatchObject({ index: 0, status: "passed", input: { x: 0 }, expected: 0 });
  });

  it("run with custom input: one case without expected", async () => {
    const { user, problem } = await fixture();
    await createSubmission({ userId: user.id, problemId: problem.id, kind: "run", customInput: { x: 42 } });
    const { job, saved } = await process(async (j) => fakeResult(j));
    expect(job?.tests).toEqual([{ input: { x: 42 } }]);
    expect(Object.hasOwn(job!.tests[0], "expected")).toBe(false);
    expect(saved.status).toBe("accepted");
    expect(saved.totalCount).toBe(1);
    expect(saved.passedCount).toBe(1);
    expect(saved.caseResults).toEqual([{ index: 0, status: "passed", input: { x: 42 }, timeMs: 1 }]);
    expect(Object.hasOwn(saved.caseResults![0], "expected")).toBe(false);
  });

  it("custom input not matching the signature → internal_error, executor not called", async () => {
    const { user, problem } = await fixture();
    await createSubmission({ userId: user.id, problemId: problem.id, kind: "run", customInput: { y: "nope" } });
    let called = false;
    const { saved } = await process(async (j) => {
      called = true;
      return fakeResult(j);
    });
    expect(called).toBe(false);
    expect(saved.status).toBe("internal_error");
    expect(saved.finishedAt).toBeInstanceOf(Date);
  });

  it("an executor crash → internal_error for that job; the loop keeps working", async () => {
    const { user, problem } = await fixture();
    const bad = await createSubmission({ userId: user.id, problemId: problem.id, code: "crash" });
    const good = await createSubmission({ userId: user.id, problemId: problem.id, code: "fine" });
    const logs: LogEntry[] = [];
    const w = startWorker({
      db: getTestDb(),
      executor: async (job) => {
        if (job.code === "crash") throw new Error("executor exploded");
        return fakeResult(job);
      },
      workerId: "w",
      concurrency: 1,
      pollMs: 10,
      staleMin: 3,
      log: (e) => logs.push(e),
    });
    try {
      await waitFor(async () => FINAL.includes((await row(good.id)).status));
    } finally {
      await w.stop();
    }
    const b = await row(bad.id);
    expect(b.status).toBe("internal_error");
    expect(b.error).toBe(INTERNAL_ERROR_TEXT);
    expect(b.finishedAt).toBeInstanceOf(Date);
    expect((await row(good.id)).status).toBe("accepted");
    expect(logs.some((l) => l.msg === "processing failed" && l.submissionId === bad.id)).toBe(true);
  });

  it("stores output containing U+0000 (not allowed by Postgres text/jsonb) instead of failing", async () => {
    const { user, problem } = await fixture();
    await createSubmission({ userId: user.id, problemId: problem.id, kind: "run", customInput: { x: 1 } });
    const { saved } = await process(async (j) =>
      fakeResult(j, {
        stdout: "a\u0000b",
        caseResults: [{ index: 0, status: "passed", input: { x: 1 }, actual: "x\u0000y" }],
      }),
    );
    expect(saved.status).toBe("accepted");
    expect(saved.stdout).toBe("a�b");
    expect(saved.caseResults?.[0].actual).toBe("x�y");
  });

  it("logs ids, language, verdict and duration, never code or stdout", async () => {
    const { user, problem } = await fixture();
    await createSubmission({
      userId: user.id,
      problemId: problem.id,
      code: "SECRET_CODE_MARKER",
    });
    const logs: LogEntry[] = [];
    await process(async (j) => fakeResult(j, { stdout: "SECRET_STDOUT_MARKER" }), logs);
    const text = JSON.stringify(logs);
    expect(text).not.toContain("SECRET_CODE_MARKER");
    expect(text).not.toContain("SECRET_STDOUT_MARKER");
    expect(logs[0]).toMatchObject({ msg: "judged", language: "python", verdict: "accepted" });
    expect(typeof logs[0].durationMs).toBe("number");
    expect(typeof logs[0].submissionId).toBe("string");
  });
});
