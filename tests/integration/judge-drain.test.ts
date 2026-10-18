// The serverless drain (`drainQueue`, used by JUDGE_EXECUTOR=vercel-sandbox,
// docs/specs/judge-prod.md) with a stub executor, no Docker: concurrent drains
// never judge a row twice, the sweep runs first, the claim window is honored,
// and a room-session submit still scores through finalize().
import { and, asc, eq, inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { roomEvents, roomSessionResults, submissions } from "@/server/db/schema";

import { drainQueue } from "../../worker/loop";
import { STALE_ERROR } from "../../worker/queue";
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
import { createRoom, createRoomSession } from "../helpers/rooms";

beforeEach(resetTestDb);
afterAll(closeTestDb);

const silent = () => {};

function accepted(job: ExecJob): ExecResult {
  return {
    status: "accepted",
    passedCount: job.tests.length,
    totalCount: job.tests.length,
    runtimeMs: 5,
    memoryKb: 9000,
    failedTestIndex: null,
    failedCase: null,
    caseResults: [],
    stdout: "",
    error: null,
  };
}

async function fixture() {
  const user = await createUser();
  const problem = await createProblem();
  await createTestCases(problem.id, 3);
  return { user, problem };
}

const base = { staleMin: 3, log: silent };

describe("drainQueue", () => {
  it("20 submissions, 4 concurrent drains: each judged exactly once, all final", async () => {
    const { user, problem } = await fixture();
    for (let i = 0; i < 20; i++) await createSubmission({ userId: user.id, problemId: problem.id, code: `job-${i}` });
    const executions = new Map<string, number>();
    const executor: Executor = async (job) => {
      executions.set(job.code, (executions.get(job.code) ?? 0) + 1);
      await new Promise((r) => setTimeout(r, 5 + Math.random() * 20));
      return accepted(job);
    };
    const db = getTestDb();
    const counts = await Promise.all(
      ["a", "b", "c", "d"].map((id) =>
        drainQueue({ ...base, db, executor, workerId: `drain-${id}`, claimWindowMs: 60_000, sweepFirst: id === "a" }),
      ),
    );
    expect(counts.reduce((a, b) => a + b, 0)).toBe(20);
    expect(executions.size).toBe(20);
    expect([...executions.values()].every((n) => n === 1)).toBe(true);
    const rows = await db.select().from(submissions);
    expect(rows.every((r) => r.status === "accepted" && r.finishedAt instanceof Date)).toBe(true);
  });

  it("returns 0 on an empty queue and claims nothing once the claim window is over", async () => {
    const db = getTestDb();
    const executor: Executor = async (job) => accepted(job);
    expect(await drainQueue({ ...base, db, executor, workerId: "w", claimWindowMs: 60_000, sweepFirst: false })).toBe(0);
    const { user, problem } = await fixture();
    const queued = await createSubmission({ userId: user.id, problemId: problem.id });
    expect(await drainQueue({ ...base, db, executor, workerId: "w", claimWindowMs: 0, sweepFirst: false })).toBe(0);
    const [row] = await db.select().from(submissions).where(eq(submissions.id, queued.id));
    expect(row.status).toBe("queued");
  });

  it("sweeps first: a row left running by a killed function becomes internal_error, never requeued", async () => {
    const { user, problem } = await fixture();
    const db = getTestDb();
    const [stale] = await db
      .insert(submissions)
      .values({
        userId: user.id,
        problemId: problem.id,
        kind: "submit",
        language: "python",
        code: "x",
        status: "running",
        startedAt: new Date(Date.now() - 10 * 60_000),
        workerId: "vercel-dead",
      })
      .returning();
    const queued = await createSubmission({ userId: user.id, problemId: problem.id });
    const judged: string[] = [];
    const executor: Executor = async (job) => {
      judged.push(job.code);
      return accepted(job);
    };
    expect(await drainQueue({ ...base, db, executor, workerId: "w", claimWindowMs: 60_000, sweepFirst: true })).toBe(1);
    const rows = await db.select().from(submissions).where(inArray(submissions.id, [stale.id, queued.id]));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(stale.id)).toMatchObject({ status: "internal_error", error: STALE_ERROR });
    expect(byId.get(queued.id)?.status).toBe("accepted");
    expect(judged).toHaveLength(1);
  });

  it("a session submit drained in-process scores through finalize (results + problem_solved event)", async () => {
    const alice = await createUser({ username: "alice" });
    const bob = await createUser({ username: "bob" });
    const p1 = await createProblem({ difficulty: "easy" });
    await createTestCases(p1.id, 3);
    const { room } = await createRoom({ owner: alice, members: [bob] });
    const session = await createRoomSession({
      roomId: room.id,
      hostId: alice.id,
      status: "live",
      startedAt: new Date(Date.now() - 10 * 60_000),
      durationMin: 90,
      problems: [{ problemId: p1.id, difficulty: "easy" }],
      participants: [alice.id, bob.id],
    });
    const db = getTestDb();
    await db
      .insert(submissions)
      .values({ userId: bob.id, problemId: p1.id, roomSessionId: session.id, kind: "submit", language: "python", code: "ok" });
    const executor: Executor = async (job) => accepted(job);
    expect(await drainQueue({ ...base, db, executor, workerId: "w", claimWindowMs: 60_000, sweepFirst: false })).toBe(1);
    const results = await db
      .select()
      .from(roomSessionResults)
      .where(and(eq(roomSessionResults.sessionId, session.id), eq(roomSessionResults.userId, bob.id)));
    expect(results).toMatchObject([{ position: 1, attempts: 1 }]);
    const events = await db
      .select({ type: roomEvents.type })
      .from(roomEvents)
      .where(eq(roomEvents.sessionId, session.id))
      .orderBy(asc(roomEvents.id));
    expect(events.map((e) => e.type)).toContain("problem_solved");
  });
});
