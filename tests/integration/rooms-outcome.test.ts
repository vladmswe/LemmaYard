// Rooms R3: session scoring through the real worker finalize path
// (worker/queue.ts → applySessionOutcome) with a stub executor, no Docker
// (docs/specs/rooms.md §3.4, §9.3; AC-S-SCO-2..5). Also the lazy close and the
// worker sweep of due sessions (§7.3).
import { and, asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { PENALTY_SEC_PER_WRONG } from "@/lib/rooms/scoring";
import {
  roomEvents,
  roomSessionParticipants,
  roomSessionResults,
  roomSessions,
  submissions,
} from "@/server/db/schema";
import { loadCalibration } from "@/server/rooms/draw";
import { closeIfDueNow, sweepRoomSessions } from "@/server/rooms/lifecycle";

import { processSubmission, startWorker } from "../../worker/loop";
import { claimNext, finalize, finalizeInternalError, toFinalFields } from "../../worker/queue";
import type { ExecJob, ExecResult, ExecStatus, Executor } from "../../worker/types";
import { closeTestDb, createProblem, createTestCases, createUser, getTestDb, resetTestDb } from "../helpers/db";
import {
  addSessionParticipant,
  createRoom,
  createRoomSession,
  SAMPLE_STARTED_AT,
  SAMPLE_SUBMISSIONS,
} from "../helpers/rooms";

beforeEach(resetTestDb);
afterAll(closeTestDb);

const silent = () => {};
const MIN = 60_000;

function result(status: ExecStatus, job?: ExecJob): ExecResult {
  const total = job?.tests.length ?? 3;
  return {
    status,
    passedCount: status === "accepted" ? total : 0,
    totalCount: total,
    runtimeMs: 10,
    memoryKb: 1000,
    failedTestIndex: status === "accepted" ? null : 0,
    failedCase: status === "wrong_answer" ? { input: { x: 0 }, expected: 0, actual: 1 } : null,
    caseResults: [],
    stdout: "",
    error: status === "accepted" || status === "wrong_answer" ? null : "boom",
  };
}

const fields = (status: ExecStatus) => toFinalFields("submit", result(status));

async function fixture({ startedMinAgo = 20, durationMin = 90 } = {}) {
  const alice = await createUser({ username: "alice" });
  const bob = await createUser({ username: "bob" });
  const carol = await createUser({ username: "carol" });
  const p1 = await createProblem({ difficulty: "easy" });
  const p2 = await createProblem({ difficulty: "medium" });
  await createTestCases(p1.id, 3);
  await createTestCases(p2.id, 3);
  const { room } = await createRoom({ owner: alice, members: [bob, carol] });
  const startedAt = new Date(Date.now() - startedMinAgo * MIN);
  const session = await createRoomSession({
    roomId: room.id,
    hostId: alice.id,
    status: "live",
    startedAt,
    durationMin,
    problems: [
      { problemId: p1.id, difficulty: "easy" },
      { problemId: p2.id, difficulty: "medium" },
    ],
    participants: [alice.id, bob.id],
  });
  return { alice, bob, carol, p1, p2, room, session, startedAt };
}

type Fx = Awaited<ReturnType<typeof fixture>>;

/** A session submit already claimed by a worker (`running`), created `minAfterStart` after the start. */
async function runningSubmit(fx: Fx, userId: string, problemId: string, minAfterStart: number, roomSessionId: string | null = fx.session.id) {
  const createdAt = new Date(fx.startedAt.getTime() + minAfterStart * MIN);
  const [row] = await getTestDb()
    .insert(submissions)
    .values({
      userId,
      problemId,
      roomSessionId,
      kind: "submit",
      language: "python",
      code: "class Solution: pass",
      status: "running",
      createdAt,
      startedAt: createdAt,
      workerId: "w-test",
    })
    .returning();
  return row;
}

async function events(sessionId: string) {
  return getTestDb()
    .select({ id: roomEvents.id, type: roomEvents.type, actor: roomEvents.actorUserId, payload: roomEvents.payload })
    .from(roomEvents)
    .where(eq(roomEvents.sessionId, sessionId))
    .orderBy(asc(roomEvents.id));
}

async function results(sessionId: string) {
  return getTestDb()
    .select()
    .from(roomSessionResults)
    .where(eq(roomSessionResults.sessionId, sessionId))
    .orderBy(asc(roomSessionResults.userId), asc(roomSessionResults.position));
}

async function participant(sessionId: string, userId: string) {
  const [row] = await getTestDb()
    .select()
    .from(roomSessionParticipants)
    .where(and(eq(roomSessionParticipants.sessionId, sessionId), eq(roomSessionParticipants.userId, userId)));
  return row;
}

describe("finalize → session outcome (AC-S-SCO-2)", () => {
  it("an accepted session submit judged by the worker loop writes results, totals and one problem_solved event", async () => {
    const fx = await fixture();
    const createdAt = new Date(fx.startedAt.getTime() + 7 * MIN + 30_000);
    const [queued] = await getTestDb()
      .insert(submissions)
      .values({ userId: fx.bob.id, problemId: fx.p1.id, roomSessionId: fx.session.id, kind: "submit", language: "python", code: "ok", createdAt })
      .returning();
    const executor: Executor = async (job) => result("accepted", job);
    const claimed = await claimNext(getTestDb(), "w-1");
    expect(claimed?.id).toBe(queued.id);
    await processSubmission(getTestDb(), executor, claimed!, silent, "w-1");

    const [row] = await getTestDb().select().from(submissions).where(eq(submissions.id, queued.id));
    expect(row.status).toBe("accepted");
    expect(await results(fx.session.id)).toMatchObject([
      {
        userId: fx.bob.id,
        position: 1,
        attempts: 1,
        wrongBeforeAccept: 0,
        firstAcceptedSubmissionId: queued.id,
        solveSeconds: 450,
        solvedBefore: false,
      },
    ]);
    expect(await participant(fx.session.id, fx.bob.id)).toMatchObject({ solvedCount: 1, penaltySec: 450, rank: 1 });
    expect(await participant(fx.session.id, fx.alice.id)).toMatchObject({ solvedCount: 0, penaltySec: 0, rank: 2 });
    expect(await events(fx.session.id)).toMatchObject([
      {
        type: "problem_solved",
        actor: fx.bob.id,
        payload: { position: 1, solveSeconds: 450, wrongBefore: 0, firstSolver: true, solvedCount: 1 },
      },
    ]);
  });

  it("finalize twice: the second call returns false and writes nothing", async () => {
    const fx = await fixture();
    const sub = await runningSubmit(fx, fx.alice.id, fx.p2.id, 5);
    expect(await finalize(getTestDb(), sub.id, fields("accepted"))).toBe(true);
    const before = JSON.stringify([await results(fx.session.id), await events(fx.session.id)], (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    expect(await finalize(getTestDb(), sub.id, fields("wrong_answer"))).toBe(false);
    expect(await finalizeInternalError(getTestDb(), [sub.id], "x")).toEqual([]);
    const after = JSON.stringify([await results(fx.session.id), await events(fx.session.id)], (_k, v) => (typeof v === "bigint" ? v.toString() : v));
    expect(after).toBe(before);
    const [row] = await getTestDb().select().from(submissions).where(eq(submissions.id, sub.id));
    expect(row.status).toBe("accepted");
  });

  it("a submit without roomSessionId during the live session never counts", async () => {
    const fx = await fixture();
    const sub = await runningSubmit(fx, fx.bob.id, fx.p1.id, 3, null);
    expect(await finalize(getTestDb(), sub.id, fields("accepted"))).toBe(true);
    expect(await results(fx.session.id)).toEqual([]);
    expect(await events(fx.session.id)).toEqual([]);
    expect(await participant(fx.session.id, fx.bob.id)).toMatchObject({ solvedCount: 0, rank: null });
  });

  it("wrong attempts: attempt_failed per counted failure, 5-minute penalty each before the accept; compile/internal errors ignored", async () => {
    const fx = await fixture();
    const db = getTestDb();
    const wa1 = await runningSubmit(fx, fx.alice.id, fx.p1.id, 2);
    const ce = await runningSubmit(fx, fx.alice.id, fx.p1.id, 3);
    const tle = await runningSubmit(fx, fx.alice.id, fx.p1.id, 4);
    const ie = await runningSubmit(fx, fx.alice.id, fx.p1.id, 5);
    const ac = await runningSubmit(fx, fx.alice.id, fx.p1.id, 10);
    const after = await runningSubmit(fx, fx.alice.id, fx.p1.id, 12);
    await finalize(db, wa1.id, fields("wrong_answer"));
    await finalize(db, ce.id, fields("compile_error"));
    await finalize(db, tle.id, fields("time_limit"));
    await finalizeInternalError(db, [ie.id], "worker crashed");
    await finalize(db, ac.id, fields("accepted"));
    await finalize(db, after.id, fields("wrong_answer"));

    expect(await results(fx.session.id)).toMatchObject([
      { position: 1, attempts: 4, wrongBeforeAccept: 2, solveSeconds: 600, firstAcceptedSubmissionId: ac.id },
    ]);
    expect(await participant(fx.session.id, fx.alice.id)).toMatchObject({
      solvedCount: 1,
      penaltySec: 600 + 2 * PENALTY_SEC_PER_WRONG,
      rank: 1,
    });
    const evs = await events(fx.session.id);
    expect(evs.map((e) => [e.type, e.payload])).toEqual([
      ["attempt_failed", { position: 1, attempts: 1 }],
      ["attempt_failed", { position: 1, attempts: 2 }],
      ["problem_solved", { position: 1, solveSeconds: 600, wrongBefore: 2, firstSolver: true, solvedCount: 1 }],
    ]);
  });

  it("first solver: only the earliest accept is marked first; the scoreboard ranks by solved then time", async () => {
    const fx = await fixture();
    const db = getTestDb();
    const bob = await runningSubmit(fx, fx.bob.id, fx.p1.id, 4);
    const alice = await runningSubmit(fx, fx.alice.id, fx.p1.id, 6);
    const alice2 = await runningSubmit(fx, fx.alice.id, fx.p2.id, 15);
    await finalize(db, bob.id, fields("accepted"));
    await finalize(db, alice.id, fields("accepted"));
    await finalize(db, alice2.id, fields("accepted"));
    const evs = await events(fx.session.id);
    expect(evs.map((e) => [e.actor, (e.payload as { firstSolver: boolean }).firstSolver])).toEqual([
      [fx.bob.id, true],
      [fx.alice.id, false],
      [fx.alice.id, true],
    ]);
    expect(await participant(fx.session.id, fx.alice.id)).toMatchObject({ solvedCount: 2, penaltySec: 360 + 900, rank: 1 });
    expect(await participant(fx.session.id, fx.bob.id)).toMatchObject({ solvedCount: 1, penaltySec: 240, rank: 2 });
  });

  it("a finalized submit of a non-participant (forged row) changes nothing", async () => {
    const fx = await fixture();
    const sub = await runningSubmit(fx, fx.carol.id, fx.p1.id, 2);
    expect(await finalize(getTestDb(), sub.id, fields("accepted"))).toBe(true);
    expect(await results(fx.session.id)).toEqual([]);
    expect(await events(fx.session.id)).toEqual([]);
  });
});

describe("out-of-order and late judging (AC-S-SCO-3, AC-S-SCO-4)", () => {
  it("A created first, B second, judged B then A: first accepted = A, one problem_solved event", async () => {
    const fx = await fixture();
    const db = getTestDb();
    const a = await runningSubmit(fx, fx.bob.id, fx.p2.id, 8);
    const b = await runningSubmit(fx, fx.bob.id, fx.p2.id, 9);
    await finalize(db, b.id, fields("accepted"));
    expect(await results(fx.session.id)).toMatchObject([{ solveSeconds: 540, firstAcceptedSubmissionId: b.id }]);
    await finalize(db, a.id, fields("accepted"));
    expect(await results(fx.session.id)).toMatchObject([
      { attempts: 2, wrongBeforeAccept: 0, solveSeconds: 480, firstAcceptedSubmissionId: a.id },
    ]);
    expect(await participant(fx.session.id, fx.bob.id)).toMatchObject({ solvedCount: 1, penaltySec: 480 });
    const evs = await events(fx.session.id);
    expect(evs.map((e) => e.type)).toEqual(["problem_solved"]);
  });

  it("WA created first but judged after the AC: the penalty is corrected, no extra event", async () => {
    const fx = await fixture();
    const db = getTestDb();
    const wa = await runningSubmit(fx, fx.bob.id, fx.p1.id, 3);
    const ac = await runningSubmit(fx, fx.bob.id, fx.p1.id, 5);
    await finalize(db, ac.id, fields("accepted"));
    await finalize(db, wa.id, fields("wrong_answer"));
    expect(await results(fx.session.id)).toMatchObject([{ attempts: 2, wrongBeforeAccept: 1, solveSeconds: 300 }]);
    expect(await participant(fx.session.id, fx.bob.id)).toMatchObject({ penaltySec: 300 + PENALTY_SEC_PER_WRONG });
    expect((await events(fx.session.id)).map((e) => e.type)).toEqual(["problem_solved"]);
  });

  it("created before ends_at, judged after the session finished: counts; the event follows session_ended", async () => {
    // Started 30 min ago, 30 min long: ends_at = now.
    const fx = await fixture({ startedMinAgo: 30, durationMin: 30 });
    const db = getTestDb();
    const late = await runningSubmit(fx, fx.alice.id, fx.p1.id, 29);
    // Forged: created after ends_at (the API rejects this; the outcome must ignore it).
    const forged = await runningSubmit(fx, fx.bob.id, fx.p1.id, 31);
    expect(await closeIfDueNow(db, fx.session.id)).toBe("expired");
    expect(await closeIfDueNow(db, fx.session.id)).toBeNull();
    const [s] = await db.select().from(roomSessions).where(eq(roomSessions.id, fx.session.id));
    expect(s).toMatchObject({ status: "finished", endReason: "time" });
    expect(s.endedAt!.getTime()).toBe(s.endsAt!.getTime());

    await finalize(db, late.id, fields("accepted"));
    await finalize(db, forged.id, fields("accepted"));
    const evs = await events(fx.session.id);
    expect(evs.map((e) => e.type)).toEqual(["session_ended", "problem_solved"]);
    expect(evs[0].payload).toEqual({ endedAt: s.endsAt!.toISOString(), reason: "time" });
    expect(await results(fx.session.id)).toMatchObject([{ userId: fx.alice.id, solveSeconds: 29 * 60 }]);
    expect(await participant(fx.session.id, fx.alice.id)).toMatchObject({ solvedCount: 1, rank: 1 });
    expect(await participant(fx.session.id, fx.bob.id)).toMatchObject({ solvedCount: 0, rank: 2 });
  });

  it("an early end by the host closes the counting window at ended_at", async () => {
    const fx = await fixture();
    const db = getTestDb();
    const before = await runningSubmit(fx, fx.bob.id, fx.p1.id, 5);
    await db.execute(sql`
      UPDATE room_sessions SET status = 'finished', ended_at = ${new Date(fx.startedAt.getTime() + 10 * MIN).toISOString()}::timestamptz,
        end_reason = 'host' WHERE id = ${fx.session.id}`);
    const after = await runningSubmit(fx, fx.alice.id, fx.p1.id, 11);
    await finalize(db, before.id, fields("accepted"));
    await finalize(db, after.id, fields("accepted"));
    expect((await results(fx.session.id)).map((r) => r.userId)).toEqual([fx.bob.id]);
  });

  it("solved before the session: the cell is marked solvedBefore and still counts", async () => {
    const fx = await fixture();
    const db = getTestDb();
    await db.insert(submissions).values({
      userId: fx.bob.id,
      problemId: fx.p1.id,
      kind: "submit",
      language: "python",
      code: "x",
      status: "accepted",
      createdAt: new Date(fx.startedAt.getTime() - 24 * 60 * MIN),
      startedAt: new Date(fx.startedAt.getTime() - 24 * 60 * MIN),
      finishedAt: new Date(fx.startedAt.getTime() - 24 * 60 * MIN + 1000),
    });
    const sub = await runningSubmit(fx, fx.bob.id, fx.p1.id, 2);
    await finalize(db, sub.id, fields("accepted"));
    expect(await results(fx.session.id)).toMatchObject([{ solvedBefore: true, solveSeconds: 120 }]);
  });
});

describe("concurrency and cursor order (AC-S-SCO-5)", () => {
  it("parallel finalizes of several participants: event ids follow commit order and a polling reader sees no gap", async () => {
    const fx = await fixture();
    const db = getTestDb();
    const dave = await createUser({ username: "dave" });
    await addSessionParticipant(fx.session.id, fx.carol.id);
    await addSessionParticipant(fx.session.id, dave.id);
    const users = [fx.alice, fx.bob, fx.carol, dave];
    const rows = [];
    for (const [ui, u] of users.entries()) {
      for (const [pi, p] of [fx.p1, fx.p2].entries()) {
        for (let k = 0; k < 3; k++) {
          rows.push({ row: await runningSubmit(fx, u.id, p.id, 1 + ui + pi * 10 + k), status: (k < 2 ? "wrong_answer" : "accepted") as ExecStatus });
        }
      }
    }

    // Reader: polls `id > cursor` (Q6) while the writers commit, like the state endpoint.
    const seen: bigint[] = [];
    let cursor = BigInt(0);
    let done = false;
    const reader = (async () => {
      while (!done) {
        const page = await db
          .select({ id: roomEvents.id })
          .from(roomEvents)
          .where(and(eq(roomEvents.sessionId, fx.session.id), sql`${roomEvents.id} > ${cursor.toString()}::bigint`))
          .orderBy(asc(roomEvents.id))
          .limit(100);
        for (const r of page) seen.push(r.id);
        if (page.length > 0) cursor = page[page.length - 1].id;
        await new Promise((r) => setTimeout(r, 1));
      }
    })();
    const shuffled = rows.sort(() => Math.random() - 0.5);
    const outcomes = await Promise.all(shuffled.map(({ row, status }) => finalize(db, row.id, fields(status))));
    done = true;
    await reader;
    // Final drain.
    const rest = await db
      .select({ id: roomEvents.id })
      .from(roomEvents)
      .where(and(eq(roomEvents.sessionId, fx.session.id), sql`${roomEvents.id} > ${cursor.toString()}::bigint`))
      .orderBy(asc(roomEvents.id));
    seen.push(...rest.map((r) => r.id));

    expect(outcomes.every(Boolean)).toBe(true);
    const all = await events(fx.session.id);
    expect(seen).toEqual(all.map((e) => e.id));
    expect(new Set(seen).size).toBe(seen.length);
    const solved = all.filter((e) => e.type === "problem_solved");
    expect(solved).toHaveLength(8);
    expect(new Set(solved.map((e) => `${e.actor}:${(e.payload as { position: number }).position}`)).size).toBe(8);
    for (const u of users) {
      expect(await participant(fx.session.id, u.id)).toMatchObject({ solvedCount: 2 });
    }
    const ranks = (await Promise.all(users.map((u) => participant(fx.session.id, u.id)))).map((p) => p.rank);
    expect(ranks).toEqual([1, 2, 3, 4]);
  });

  it("two worker loops with a stub executor judge session submits of two users exactly once each", async () => {
    const fx = await fixture();
    const db = getTestDb();
    for (const u of [fx.alice, fx.bob]) {
      for (const p of [fx.p1, fx.p2]) {
        await db.insert(submissions).values({ userId: u.id, problemId: p.id, roomSessionId: fx.session.id, kind: "submit", language: "python", code: "ok" });
      }
    }
    const executor: Executor = async (job) => {
      await new Promise((r) => setTimeout(r, Math.random() * 20));
      return result("accepted", job);
    };
    const options = { db, executor, concurrency: 2, pollMs: 10, staleMin: 3, log: silent };
    const a = startWorker({ ...options, workerId: "a" });
    const b = startWorker({ ...options, workerId: "b" });
    const deadline = Date.now() + 15_000;
    try {
      while ((await db.$count(submissions, sql`${submissions.status} IN ('queued', 'running')`)) > 0) {
        if (Date.now() > deadline) throw new Error("timed out");
        await new Promise((r) => setTimeout(r, 25));
      }
    } finally {
      await Promise.all([a.stop(), b.stop()]);
    }
    const evs = await events(fx.session.id);
    expect(evs.filter((e) => e.type === "problem_solved")).toHaveLength(4);
    expect(await participant(fx.session.id, fx.alice.id)).toMatchObject({ solvedCount: 2 });
    expect(await participant(fx.session.id, fx.bob.id)).toMatchObject({ solvedCount: 2 });
  });
});

describe("due transitions (lazy close and worker sweep, §7.3)", () => {
  it("sweepRoomSessions finishes an expired live session and cancels a stale lobby, once", async () => {
    const owner = await createUser();
    const { room: r1 } = await createRoom({ owner });
    const { room: r2 } = await createRoom({ owner });
    const { room: r3 } = await createRoom({ owner });
    const expired = await createRoomSession({ roomId: r1.id, status: "live", startedAt: new Date(Date.now() - 100 * MIN), durationMin: 90 });
    const stale = await createRoomSession({ roomId: r2.id, createdAt: new Date(Date.now() - 8 * 24 * 60 * MIN) });
    const fresh = await createRoomSession({ roomId: r3.id, status: "live", startedAt: new Date(Date.now() - 10 * MIN) });
    const db = getTestDb();
    const [first, second] = await Promise.all([sweepRoomSessions(db), sweepRoomSessions(db)]);
    expect([...first.expired, ...second.expired]).toEqual([expired.id]);
    expect([...first.stale, ...second.stale]).toEqual([stale.id]);
    const rows = await db.select().from(roomSessions).orderBy(asc(roomSessions.createdAt));
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(expired.id)).toMatchObject({ status: "finished", endReason: "time" });
    expect(byId.get(stale.id)).toMatchObject({ status: "cancelled", endReason: "stale" });
    expect(byId.get(fresh.id)).toMatchObject({ status: "live" });
    expect((await events(expired.id)).map((e) => e.type)).toEqual(["session_ended"]);
    expect((await events(stale.id)).map((e) => e.type)).toEqual(["session_cancelled"]);
  });

  it("the worker loop runs the session sweep", async () => {
    const owner = await createUser();
    const { room } = await createRoom({ owner });
    const expired = await createRoomSession({ roomId: room.id, status: "live", startedAt: new Date(Date.now() - 100 * MIN) });
    const db = getTestDb();
    const w = startWorker({ db, executor: async (job) => result("accepted", job), workerId: "s", concurrency: 1, pollMs: 10, staleMin: 3, log: silent });
    const deadline = Date.now() + 10_000;
    try {
      for (;;) {
        const [s] = await db.select().from(roomSessions).where(eq(roomSessions.id, expired.id));
        if (s.status === "finished") break;
        if (Date.now() > deadline) throw new Error("timed out");
        await new Promise((r) => setTimeout(r, 25));
      }
    } finally {
      await w.stop();
    }
  });
});

describe("spec §6.4 sample through finalize()", () => {
  it("replaying the 13 submits reproduces results, totals, ranks, events and the calibration contribution", async () => {
    const db = getTestDb();
    const users = {
      alice: await createUser({ username: "alice" }),
      bob: await createUser({ username: "bob" }),
      carol: await createUser({ username: "carol" }),
    };
    const specs = [
      ["valid-anagram", "easy"],
      ["house-robber", "medium"],
      ["coin-change", "medium"],
      ["edit-distance", "hard"],
    ] as const;
    const probs = [];
    for (const [slug, difficulty] of specs) probs.push(await createProblem({ slug, title: slug, difficulty }));
    const { room } = await createRoom({ owner: users.alice, members: [users.bob, users.carol] });
    // The sample's clock times, shifted into the past (SAMPLE_STARTED_AT may lie
    // ahead), so the lazy close can run before carol's late P3 verdict.
    const startedAt = new Date(Math.floor((Date.now() - 3 * 24 * 60 * MIN) / 1000) * 1000);
    const session = await createRoomSession({
      roomId: room.id,
      hostId: users.alice.id,
      status: "live",
      startedAt,
      problems: probs.map((p) => ({ problemId: p.id, difficulty: p.difficulty })),
      participants: [users.alice.id, users.bob.id, users.carol.id],
    });
    const fx = { startedAt, session } as unknown as Fx;
    for (const [i, sub] of SAMPLE_SUBMISSIONS.entries()) {
      const minutes = (new Date(`2026-10-24T${sub.created}Z`).getTime() - SAMPLE_STARTED_AT.getTime()) / MIN;
      const row = await runningSubmit(fx, users[sub.user].id, probs[sub.position - 1].id, minutes);
      if (i === SAMPLE_SUBMISSIONS.length - 1) expect(await closeIfDueNow(db, session.id)).toBe("expired");
      expect(await finalize(db, row.id, fields(sub.status))).toBe(true);
    }

    const totals = await db
      .select({
        userId: roomSessionParticipants.userId,
        solved: roomSessionParticipants.solvedCount,
        penalty: roomSessionParticipants.penaltySec,
        rank: roomSessionParticipants.rank,
      })
      .from(roomSessionParticipants)
      .where(eq(roomSessionParticipants.sessionId, session.id));
    const byUser = new Map(totals.map((t) => [t.userId, t]));
    expect(byUser.get(users.alice.id)).toMatchObject({ solved: 3, penalty: 5200, rank: 1 });
    expect(byUser.get(users.carol.id)).toMatchObject({ solved: 3, penalty: 8510, rank: 2 });
    expect(byUser.get(users.bob.id)).toMatchObject({ solved: 2, penalty: 2640, rank: 3 });

    const name = (id: string | null) => Object.entries(users).find(([, u]) => u.id === id)?.[0] ?? null;
    const cells = (await results(session.id)).map(
      (r) => `${name(r.userId)} P${r.position} ${r.attempts}/${r.wrongBeforeAccept}/${r.solveSeconds ?? "-"}`,
    );
    expect(cells.sort()).toEqual(
      [
        "alice P1 1/0/370",
        "alice P2 2/1/1470",
        "alice P3 1/0/3060",
        "alice P4 1/1/-",
        "bob P1 1/0/240",
        "bob P2 1/1/-",
        "bob P3 1/0/2400",
        "carol P1 2/1/720",
        "carol P2 1/0/2100",
        "carol P3 1/0/5390",
      ].sort(),
    );

    const evs = (await events(session.id)).map((e) => [e.type, name(e.actor), e.payload]);
    const solved = (u: string, position: number, solveSeconds: number, wrongBefore: number, firstSolver: boolean, solvedCount: number) =>
      ["problem_solved", u, { position, solveSeconds, wrongBefore, firstSolver, solvedCount }];
    const failed = (u: string, position: number, attempts: number) => ["attempt_failed", u, { position, attempts }];
    // Spec §6.4 events 106–118 (no event for bob's compile error).
    expect(evs).toEqual([
      solved("bob", 1, 240, 0, true, 1),
      solved("alice", 1, 370, 0, false, 1),
      failed("carol", 1, 1),
      solved("carol", 1, 720, 1, false, 1),
      failed("alice", 2, 1),
      solved("alice", 2, 1470, 1, true, 2),
      solved("carol", 2, 2100, 0, false, 2),
      solved("bob", 3, 2400, 0, true, 2),
      failed("bob", 2, 1),
      solved("alice", 3, 3060, 0, false, 3),
      failed("alice", 4, 1),
      ["session_ended", null, { endedAt: new Date(startedAt.getTime() + 90 * MIN).toISOString(), reason: "time" }],
      solved("carol", 3, 5390, 0, false, 3),
    ]);

    // Q4: the calibration contribution of s1 is easy 3/3, medium 5/6, hard 0/3.
    const calibration = await db.transaction((tx) => loadCalibration(tx, room.id));
    expect(calibration.sessions).toBe(1);
    expect(calibration.counts).toEqual({
      easy: { solved: 3, pairs: 3 },
      medium: { solved: 5, pairs: 6 },
      hard: { solved: 0, pairs: 3 },
    });
  });
});
