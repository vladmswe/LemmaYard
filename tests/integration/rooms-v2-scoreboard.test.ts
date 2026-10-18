// Rooms v2 scoreboard + live attempts on the real database
// (docs/specs/rooms-v2.md §3, §9.2; AC-V2-LIVE-1, AC-V2-MX-2/6): the state
// response's additive `pending` list (who has a session submit in flight for
// which problem, never a verdict), its query budget, non-member 404, and the
// results / history / timeline data behind the matrix for N = 1, 2, 4, 5, 8.
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { matrixRows } from "@/lib/rooms/live-view";
import { resultFacts, timelineMarks } from "@/lib/rooms/history";
import { createDb, schema, type Db } from "@/server/db";
import { roomSessionParticipants, roomSessionProblems, roomSessions, submissions } from "@/server/db/schema";
import { getMemberTimeline, getRoomHistory } from "@/server/rooms/history";
import { getSessionResults, type FinishedResults } from "@/server/rooms/results";
import { computeSessionState } from "@/server/rooms/state";

import { closeTestDb, createProblem, createUser, getTestDb, resetTestDb, testDbUrl } from "../helpers/db";
import {
  addSessionParticipant,
  createRoom,
  createRoomSession,
  createSessionResult,
  createSessionSubmission,
  loadSampleSession,
} from "../helpers/rooms";

const MIN = 60_000;

beforeEach(async () => {
  await resetTestDb();
});
afterAll(closeTestDb);

const db = () => getTestDb();

function countingDb() {
  const { pool } = createDb(testDbUrl());
  const counter = { n: 0 };
  const counting = drizzle(pool, { schema, logger: { logQuery: () => void counter.n++ } }) as unknown as Db;
  return { db: counting, counter, close: () => pool.end() };
}

async function liveRoom(n = 4) {
  const [alice, bob, carol, eve] = await Promise.all(["alice", "bob", "carol", "eve"].map((u) => createUser({ username: u })));
  const { room } = await createRoom({ owner: alice, members: [bob, carol] });
  const problems = [];
  for (let i = 0; i < n; i++) problems.push(await createProblem({ difficulty: i % 2 === 0 ? "easy" : "medium" }));
  const session = await createRoomSession({
    roomId: room.id,
    hostId: alice.id,
    status: "live",
    startedAt: new Date(Date.now() - 20 * MIN),
    problems: problems.map((p) => ({ problemId: p.id, difficulty: p.difficulty })),
    participants: [alice.id, bob.id],
  });
  return { alice, bob, carol, eve, room, problems, session };
}

describe("state endpoint: pending (AC-V2-LIVE-1)", () => {
  it("lists (participant, position, count) for queued/running session submits only; pendingJudging keeps counting", async () => {
    const { alice, bob, carol, room, problems, session } = await liveRoom();
    const sub = (userId: string, i: number, status: "queued" | "running" | "wrong_answer" | "accepted") =>
      createSessionSubmission({ userId, problemId: problems[i].id, roomSessionId: session.id, status, createdAt: new Date(Date.now() - MIN) });
    await sub(bob.id, 1, "queued");
    await sub(bob.id, 1, "running");
    await sub(alice.id, 0, "running");
    await sub(bob.id, 2, "wrong_answer");
    await sub(alice.id, 3, "accepted");
    // A practice submit (no session) of the same problem is not pending for the room.
    await createSessionSubmission({ userId: bob.id, problemId: problems[3].id, roomSessionId: null, status: "queued", createdAt: new Date() });

    const st = (await computeSessionState(db(), room.id, session.id, carol.id))!;
    expect(st.pending).toEqual([
      { userId: alice.id, position: 1, count: 1 },
      { userId: bob.id, position: 2, count: 2 },
    ]);
    expect(st.pendingJudging).toBe(3);
    for (const p of st.pending!) expect(Object.keys(p).sort()).toEqual(["count", "position", "userId"]);
    // No verdict types, statuses or code anywhere in the response.
    expect(JSON.stringify(st)).not.toMatch(/queued|running|wrong_answer|accepted|"code"|"status":"(?!live)/);

    // Judged → no longer pending.
    await db().update(submissions).set({ status: "wrong_answer", startedAt: new Date(), finishedAt: new Date() }).where(eq(submissions.userId, bob.id));
    const after = (await computeSessionState(db(), room.id, session.id, carol.id, { after: st.cursor }))!;
    expect(after.pending).toEqual([{ userId: alice.id, position: 1, count: 1 }]);
    expect(after.pendingJudging).toBe(1);
  });

  it("lobby: empty list; finished with judging still pending: listed", async () => {
    const { alice, bob, room, problems, session: live } = await liveRoom(2);
    const other = await createRoom({ owner: alice });
    const lobby = await createRoomSession({ roomId: other.room.id, hostId: alice.id, participants: [alice.id] });
    expect((await computeSessionState(db(), other.room.id, lobby.id, alice.id))!.pending).toEqual([]);
    // One open session per room: end the live one first.
    await db().update(roomSessions).set({ status: "finished", endedAt: new Date(), endReason: "host" }).where(eq(roomSessions.id, live.id));

    const finished = await createRoomSession({
      roomId: room.id,
      hostId: alice.id,
      status: "finished",
      startedAt: new Date(Date.now() - 100 * MIN),
      problems: problems.map((p) => ({ problemId: p.id, difficulty: p.difficulty })),
      participants: [bob.id],
    });
    await createSessionSubmission({ userId: bob.id, problemId: problems[1].id, roomSessionId: finished.id, status: "queued", createdAt: new Date(Date.now() - 95 * MIN) });
    const st = (await computeSessionState(db(), room.id, finished.id, bob.id))!;
    expect(st.status).toBe("finished");
    expect(st.pending).toEqual([{ userId: bob.id, position: 2, count: 1 }]);
  });

  it("non-members and other rooms' ids get null (404)", async () => {
    const { eve, room, session } = await liveRoom();
    expect(await computeSessionState(db(), room.id, session.id, eve.id)).toBeNull();
    const other = await createRoom({ owner: eve });
    expect(await computeSessionState(db(), other.room.id, session.id, eve.id)).toBeNull();
  });

  it("query budget unchanged: the gate (with pending) is one statement; + 2 for a snapshot", async () => {
    const { bob, carol, room, problems, session } = await liveRoom();
    await createSessionSubmission({ userId: bob.id, problemId: problems[0].id, roomSessionId: session.id, status: "queued", createdAt: new Date() });
    const first = (await computeSessionState(db(), room.id, session.id, carol.id))!;
    const c = countingDb();
    try {
      const idle = await computeSessionState(c.db, room.id, session.id, carol.id, { after: first.cursor });
      expect(idle!.pending).toHaveLength(1);
      expect(c.counter.n).toBe(1); // + the signed-in user read in the route = 2 (≤ 3)
      c.counter.n = 0;
      await computeSessionState(c.db, room.id, session.id, carol.id, { after: first.cursor, snapshot: true });
      expect(c.counter.n).toBe(3);
    } finally {
      await c.close();
    }
  });
});

// --- Results / history / timeline for N = 1, 2, 4, 5, 8 ----------------------------

type Cell = [solveMin: number | null, wrong: number] | null;

async function finishedSession(n: number, plan: Record<string, Cell[]>) {
  const names = Object.keys(plan);
  const people = await Promise.all(names.map((u) => createUser({ username: u })));
  const [owner, ...rest] = people;
  const { room } = await createRoom({ owner, members: rest });
  const problems = [];
  for (let i = 0; i < n; i++) problems.push(await createProblem({ difficulty: (["easy", "medium", "hard"] as const)[i % 3] }));
  const startedAt = new Date(Date.now() - 3 * 60 * MIN);
  const durationMin = 15 * n + 30;
  const session = await createRoomSession({
    roomId: room.id,
    hostId: owner.id,
    status: "finished",
    startedAt,
    durationMin,
    problems: problems.map((p) => ({ problemId: p.id, difficulty: p.difficulty })),
  });
  // Totals and ranks as finalize() would compute them.
  const totals = names.map((u) => {
    const solved = plan[u].filter((c) => c && c[0] !== null) as [number, number][];
    return { u, solved: solved.length, penalty: solved.reduce((s, c) => s + c[0] * 60 + 300 * c[1], 0) };
  });
  const sorted = [...totals].sort((a, b) => b.solved - a.solved || a.penalty - b.penalty || (a.u < b.u ? -1 : 1));
  for (const [i, person] of people.entries()) {
    const t = totals[i];
    const rank = sorted.findIndex((s) => s.solved === t.solved && s.penalty === t.penalty) + 1;
    await addSessionParticipant(session.id, person.id, { solvedCount: t.solved, penaltySec: t.penalty, rank });
    for (const [pi, c] of plan[names[i]].entries()) {
      if (!c) continue;
      const [solveMin, wrong] = c;
      await createSessionResult({
        sessionId: session.id,
        userId: person.id,
        position: pi + 1,
        attempts: wrong + (solveMin === null ? 0 : 1),
        wrongBeforeAccept: wrong,
        solveSeconds: solveMin === null ? null : solveMin * 60,
        firstAcceptedAt: solveMin === null ? null : new Date(startedAt.getTime() + solveMin * MIN),
      });
    }
  }
  return { room, session, people, names, durationMin };
}

const PLANS: Record<number, Record<string, Cell[]>> = {
  1: { alice: [[14, 0]], bob: [[26, 1]], carol: [[null, 1]], dan: [null] },
  2: { alice: [[10, 0], [44, 1]], bob: [[11, 0], [32, 0]], carol: [[7, 1], [null, 2]], dan: [[41, 3], null] },
  4: {
    alice: [[6, 0], [24, 1], [51, 0], [null, 1]],
    bob: [[4, 0], [71, 2], [40, 0], null],
    carol: [[12, 1], [35, 0], [89, 0], [null, 2]],
    dan: [[33, 2], null, null, null],
  },
  5: {
    alice: [[4, 0], [10, 0], [29, 1], [72, 1], [null, 2]],
    bob: [[5, 0], [16, 0], [88, 1], [58, 0], [116, 0]],
    carol: [[5, 1], [22, 0], [47, 0], [null, 1], null],
    dan: [[9, 0], [42, 2], null, null, null],
  },
  8: {
    ann: Array.from({ length: 8 }, (_, i): Cell => [10 + i * 15, 0]),
    ben: [[20, 1], [21, 0], null, null, null, null, null, [null, 3]],
  },
};

describe.each([1, 2, 4, 5, 8])("finished session with N = %i problems", (n) => {
  it("results: one cell per problem, first solvers, splits, timeline markers; rating slot empty", async () => {
    const { room, session, people, names, durationMin } = await finishedSession(n, PLANS[n]);
    const r = (await getSessionResults(db(), room.id, session.id, people[0].id)) as FinishedResults;
    expect(r.kind).toBe("finished");
    expect(r.problems).toHaveLength(n);
    for (const p of r.participants) {
      expect(p.cells.map((c) => c.position)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
      expect(p.ratingChange).toBeUndefined();
    }
    // First solver per column = earliest solve in the plan.
    for (let pos = 1; pos <= n; pos++) {
      const times = names.map((u) => PLANS[n][u][pos - 1]).map((c) => (c && c[0] !== null ? c[0] : Infinity));
      const best = Math.min(...times);
      const expected = names.filter((_, i) => times[i] === best && best !== Infinity).sort();
      const firsts = r.participants.filter((p) => p.cells[pos - 1].firstSolver).map((p) => p.username).sort();
      expect(firsts).toEqual(expected);
    }
    const rows = matrixRows(r.participants, r.problems.map((p) => p.position), { viewerId: people[0].id, durationSec: durationMin * 60 });
    for (const row of rows) {
      const solvedTimes = row.cells.filter((c) => c.state === "solved").map((c) => c.solveSeconds!).sort((a, b) => a - b);
      // Splits: first solve none, the rest = difference to the previous solve.
      const bySolve = [...row.cells].filter((c) => c.state === "solved").sort((a, b) => a.solveSeconds! - b.solveSeconds!);
      bySolve.forEach((c, i) => expect(c.splitSeconds).toBe(i === 0 ? null : solvedTimes[i] - solvedTimes[i - 1]));
      expect(timelineMarks(row.cells, durationMin * 60)).toHaveLength(row.solved);
    }
    expect(resultFacts(rows).winners.length).toBeGreaterThan(0);
  });

  it("history: the mini-matrix standings carry each person's cells (by rank) in the same ≤ 5 queries", async () => {
    const { room, session, people, names } = await finishedSession(n, PLANS[n]);
    const c = countingDb();
    try {
      const h = (await getRoomHistory(c.db, room.id, people[0].id))!;
      expect(c.counter.n).toBeLessThanOrEqual(5);
      const item = h.sessions.find((s) => s.id === session.id)!;
      expect(item.problems).toHaveLength(n);
      expect(item.standings).toHaveLength(names.length);
      expect(item.standings.map((s) => s.rank)).toEqual([...item.standings.map((s) => s.rank)].sort((a, b) => a! - b!));
      for (const s of item.standings) {
        const plan = PLANS[n][s.username];
        expect(s.cells.length).toBe(plan.filter((x) => x !== null).length);
        for (const cell of s.cells) {
          const [solveMin, wrong] = plan[cell.position - 1]!;
          expect(cell.solveSeconds).toBe(solveMin === null ? null : solveMin * 60);
          expect(cell.wrongBefore).toBe(wrong);
        }
      }
      const firsts = item.standings.flatMap((s) => s.cells.filter((x) => x.firstSolver).map((x) => x.position));
      // Every solved column has at least one first solver.
      const solvedColumns = new Set(item.standings.flatMap((s) => s.cells.filter((x) => x.solveSeconds !== null).map((x) => x.position)));
      expect(new Set(firsts)).toEqual(solvedColumns);
    } finally {
      await c.close();
    }
  });
});

describe("results rating slots (rooms-v2 §2.2)", () => {
  it("filled once the ratings are applied: before/delta per participant, before→after per problem; null for inactive", async () => {
    const { room, session, people } = await finishedSession(2, PLANS[2]);
    const [alice, bob, carol, dan] = people;
    const d = db();
    // Not rated yet: no slots.
    let r = (await getSessionResults(d, room.id, session.id, alice.id)) as FinishedResults;
    expect(r.participants.every((p) => p.ratingChange === undefined)).toBe(true);
    expect(r.problems.every((p) => p.rating === undefined)).toBe(true);

    const start: [typeof alice, number, number][] = [[alice, 1500, 20], [bob, 1400, 12], [carol, 1300, -8], [dan, 1200, -24]];
    for (const [u, before, delta] of start) {
      await d
        .update(roomSessionParticipants)
        .set({ ratingAtStart: before, ratingDelta: delta })
        .where(and(eq(roomSessionParticipants.sessionId, session.id), eq(roomSessionParticipants.userId, u.id)));
    }
    for (const [position, before, delta] of [[1, 1350, -10], [2, 1450, 15]] as const) {
      await d
        .update(roomSessionProblems)
        .set({ ratingAtStart: before, ratingDelta: delta })
        .where(and(eq(roomSessionProblems.sessionId, session.id), eq(roomSessionProblems.position, position)));
    }
    await d.update(roomSessions).set({ rated: true }).where(eq(roomSessions.id, session.id));
    // Rated but not applied yet (pending): still no slots.
    r = (await getSessionResults(d, room.id, session.id, alice.id)) as FinishedResults;
    expect(r.participants.every((p) => p.ratingChange === undefined)).toBe(true);

    await d.update(roomSessions).set({ ratedAt: new Date() }).where(eq(roomSessions.id, session.id));
    r = (await getSessionResults(d, room.id, session.id, alice.id)) as FinishedResults;
    const byName = new Map(r.participants.map((p) => [p.username, p.ratingChange]));
    expect(byName.get("alice")).toMatchObject({ before: 1500, delta: 20 });
    expect(byName.get("dan")).toMatchObject({ before: 1200, delta: -24 });
    expect(r.problems.map((p) => p.rating)).toEqual([
      { before: 1350, after: 1340 },
      { before: 1450, after: 1465 },
    ]);
  });
});

describe("member timeline chips (rooms-v2 §2.4)", () => {
  it("marks first solves in Q3 (same 3 queries)", async () => {
    const sample = await loadSampleSession();
    const c = countingDb();
    try {
      const t = (await getMemberTimeline(c.db, sample.room.id, sample.users.alice.id, "bob"))!;
      expect(c.counter.n).toBe(3);
      // §6.4: bob was first on Problems 1 and 3, alice on 2.
      expect(t.sessions[0].problems.map((p) => [p.position, p.firstSolver])).toEqual([
        [1, true],
        [2, false],
        [3, true],
        [4, false],
      ]);
      const alice = (await getMemberTimeline(db(), sample.room.id, sample.users.bob.id, "alice"))!;
      expect(alice.sessions[0].problems.map((p) => p.firstSolver)).toEqual([false, true, false, false]);
    } finally {
      await c.close();
    }
  });
});
