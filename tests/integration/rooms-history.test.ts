// Rooms R5: history list, session results, solutions viewer, leaderboard and
// member timeline on the real test database (docs/specs/rooms.md §4, §5,
// §6.4, §6.5 Q2–Q5, §8.2; AC-S-DB-3, AC-S-HIS-1/2, AC-S-SEC-1/2). Finished
// sessions come from the factories (`loadSampleSession()` replays §6.4) and,
// in one test, from R3's real finalize() with a stub verdict.
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createDb, schema, type Db } from "@/server/db";
import { roomMembers, rooms, roomSessionResults, submissions } from "@/server/db/schema";

const state = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  cookies: new Map<string, string>(),
}));

vi.mock("@/server/db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/db")>();
  return { ...mod, getDb: () => state.db! };
});

vi.mock("next/headers", () => ({
  cookies: () => {
    const jar = new Map(state.cookies);
    return Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    });
  },
}));

import { GET as solutionRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/solutions/[userId]/[position]/route";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { signSessionToken } from "@/server/auth/token";
import { getEnv } from "@/server/env";
import { getMemberTimeline, getRoomHistory, getRoomLeaderboard } from "@/server/rooms/history";
import { getSessionResults, getSessionSolution, type FinishedResults } from "@/server/rooms/results";

import { finalize, toFinalFields } from "../../worker/queue";
import { closeTestDb, createProblem, createTestCases, createUser, getTestDb, resetTestDb, testDbUrl } from "../helpers/db";
import {
  addRoomMember,
  addSessionParticipant,
  createRoom,
  createRoomSession,
  createSessionResult,
  createSessionSubmission,
  loadSampleSession,
  type SampleSession,
} from "../helpers/rooms";

const ORIGIN = new URL(getEnv().AUTH_URL).origin;
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

beforeEach(async () => {
  await resetTestDb();
  state.db = getTestDb();
  state.cookies.clear();
});
afterAll(closeTestDb);

const db = () => getTestDb();

/** A Drizzle client on its own pool that counts statements. */
function countingDb() {
  const { pool } = createDb(testDbUrl());
  const counter = { n: 0 };
  const counting = drizzle(pool, { schema, logger: { logQuery: () => void counter.n++ } }) as unknown as Db;
  return { db: counting, counter, close: () => pool.end() };
}

async function finished(sample: SampleSession, viewer: "alice" | "bob" | "carol" = "alice") {
  const r = await getSessionResults(db(), sample.room.id, sample.session.id, sample.users[viewer].id);
  expect(r?.kind).toBe("finished");
  return r as FinishedResults;
}

function row(r: FinishedResults, username: string) {
  const p = r.participants.find((x) => x.username === username);
  expect(p).toBeDefined();
  return p!;
}

describe("session results (§6.4 worked example, AC-S-DB-3)", () => {
  it("ranks, solved counts, penalty totals and breakdown match the spec", async () => {
    const sample = await loadSampleSession();
    const r = await finished(sample);
    expect(r.participants.map((p) => [p.username, p.rank, p.solvedCount, p.penaltySec])).toEqual([
      ["alice", 1, 3, 5200],
      ["carol", 2, 3, 8510],
      ["bob", 3, 2, 2640],
    ]);
    expect(row(r, "alice").breakdown).toEqual({ solveSec: 4900, wrongCount: 1, penaltySec: 300, totalSec: 5200 });
    expect(row(r, "carol").breakdown).toEqual({ solveSec: 8210, wrongCount: 1, penaltySec: 300, totalSec: 8510 });
    expect(row(r, "bob").breakdown).toEqual({ solveSec: 2640, wrongCount: 0, penaltySec: 0, totalSec: 2640 });
    expect(row(r, "alice").isHost).toBe(true);
    expect(r.session.host).toBe("alice");
    expect(r.session.runMinutes).toBe(90);
    expect(r.session.pendingJudging).toBe(0);
    expect(r.viewer).toMatchObject({ isParticipant: true, role: "owner" });
  });

  it("per-problem grid: attempts / wrong before / solve seconds, first solvers, unsolved attempts", async () => {
    const sample = await loadSampleSession();
    const r = await finished(sample, "bob");
    const grid = Object.fromEntries(
      r.participants.map((p) => [p.username, p.cells.map((c) => [c.attempts, c.wrongBefore, c.solveSeconds, c.firstSolver])]),
    );
    expect(grid).toEqual({
      alice: [[1, 0, 370, false], [2, 1, 1470, true], [1, 0, 3060, false], [1, 1, null, false]],
      carol: [[2, 1, 720, false], [1, 0, 2100, false], [1, 0, 5390, false], [0, 0, null, false]],
      bob: [[1, 0, 240, true], [1, 1, null, false], [1, 0, 2400, true], [0, 0, null, false]],
    });
    expect(r.summaries.map((s) => [s.position, s.solvedBy, s.attemptedBy, s.firstSolvers.map((f) => [f.username, f.solveSeconds])])).toEqual([
      [1, 3, 3, [["bob", 240]]],
      [2, 2, 3, [["alice", 1470]]],
      [3, 3, 3, [["bob", 2400]]],
      [4, 0, 1, []],
    ]);
    expect(r.problems.map((p) => [p.position, p.slug, p.difficulty, p.pinned])).toEqual([
      [1, "valid-anagram", "easy", false],
      [2, "house-robber", "medium", false],
      [3, "coin-change", "medium", true],
      [4, "edit-distance", "hard", false],
    ]);
  });

  it("never carries code or submission ids, only whether a solution may be opened", async () => {
    const sample = await loadSampleSession();
    const r = await finished(sample, "bob");
    const json = JSON.stringify(r);
    expect(json).not.toContain("pass"); // the factories' code text
    const { rows } = await db().execute<{ id: string }>(sql`SELECT id FROM submissions`);
    for (const { id } of rows) expect(json).not.toContain(id);
    // Bob sees alice's solved cells as viewable, unsolved ones as unsolved.
    expect(row(r, "alice").cells.map((c) => c.solution)).toEqual([
      { visible: true },
      { visible: true },
      { visible: true },
      { visible: false, reason: "unsolved" },
    ]);
  });

  it("a session past ends_at is closed lazily and then shown; lobby and live are 'open'", async () => {
    const p = await createProblem();
    const slots = [{ problemId: p.id, difficulty: "easy" as const }];
    const a = await createRoom();
    const live = await createRoomSession({
      roomId: a.room.id,
      status: "live",
      startedAt: new Date(Date.now() - 10 * MIN),
      problems: slots,
      participants: [a.owner.id],
    });
    expect(await getSessionResults(db(), a.room.id, live.id, a.owner.id)).toEqual({ kind: "open", status: "live" });
    const b = await createRoom();
    const lobby = await createRoomSession({ roomId: b.room.id, problems: slots });
    expect(await getSessionResults(db(), b.room.id, lobby.id, b.owner.id)).toEqual({ kind: "open", status: "lobby" });

    const c = await createRoom();
    const expired = await createRoomSession({
      roomId: c.room.id,
      status: "live",
      startedAt: new Date(Date.now() - 100 * MIN),
      problems: slots,
      participants: [c.owner.id],
    });
    const r = await getSessionResults(db(), c.room.id, expired.id, c.owner.id);
    expect(r?.kind).toBe("finished");
    expect((r as FinishedResults).session.endReason).toBe("time");
  });

  it("cancelled sessions have no results", async () => {
    const { room, owner } = await createRoom();
    const s = await createRoomSession({ roomId: room.id, status: "cancelled" });
    expect(await getSessionResults(db(), room.id, s.id, owner.id)).toMatchObject({ kind: "cancelled" });
  });

  it("scores produced by R3's finalize() (stub verdict) show up after the lazy close", async () => {
    const alice = await createUser({ username: "alice" });
    const bob = await createUser({ username: "bob" });
    const p1 = await createProblem({ difficulty: "easy" });
    await createTestCases(p1.id, 3);
    const { room } = await createRoom({ owner: alice, members: [bob] });
    const startedAt = new Date(Date.now() - 80 * MIN);
    const session = await createRoomSession({
      roomId: room.id,
      hostId: alice.id,
      status: "live",
      startedAt,
      durationMin: 90,
      problems: [{ problemId: p1.id, difficulty: "easy" }],
      participants: [alice.id, bob.id],
    });
    const [sub] = await db()
      .insert(submissions)
      .values({
        userId: bob.id,
        problemId: p1.id,
        roomSessionId: session.id,
        kind: "submit",
        language: "python",
        code: "class Solution: pass",
        status: "running",
        createdAt: new Date(startedAt.getTime() + 7 * MIN),
        startedAt: new Date(startedAt.getTime() + 7 * MIN),
        workerId: "w-test",
      })
      .returning();
    const ok = await finalize(db(), sub.id, toFinalFields("submit", {
      status: "accepted",
      passedCount: 3,
      totalCount: 3,
      runtimeMs: 12,
      memoryKb: 900,
      failedTestIndex: null,
      failedCase: null,
      caseResults: [],
      stdout: "",
      error: null,
    }));
    expect(ok).toBe(true);
    // Still live: the results page sends the viewer to the session screen.
    expect(await getSessionResults(db(), room.id, session.id, alice.id)).toEqual({ kind: "open", status: "live" });
    await db().execute(sql`
      UPDATE room_sessions SET started_at = started_at - interval '20 minutes', ends_at = ends_at - interval '20 minutes'
      WHERE id = ${session.id}`);
    await db().execute(sql`UPDATE submissions SET created_at = created_at - interval '20 minutes' WHERE id = ${sub.id}`);
    const r = (await getSessionResults(db(), room.id, session.id, alice.id)) as FinishedResults;
    expect(r.kind).toBe("finished");
    expect(r.participants.map((p) => [p.username, p.rank, p.solvedCount, p.penaltySec])).toEqual([
      ["bob", 1, 1, 420],
      ["alice", 2, 0, 0],
    ]);
    const solution = await getSessionSolution(db(), room.id, session.id, alice.id, { username: "bob" }, "1");
    expect(solution).toMatchObject({ code: "class Solution: pass", runtimeMs: 12, solveSeconds: 420 });
  });

  it("results budget: ≤ 5 queries (Q0, session, problems, participants with cells, topic names)", async () => {
    const sample = await loadSampleSession();
    const c = countingDb();
    try {
      await getSessionResults(c.db, sample.room.id, sample.session.id, sample.users.bob.id);
      expect(c.counter.n).toBe(4); // no topics in the sample → no tag query
      await db().execute(sql`UPDATE room_sessions SET settings = jsonb_set(settings, '{tags}', '["array"]') WHERE id = ${sample.session.id}`);
      c.counter.n = 0;
      await getSessionResults(c.db, sample.room.id, sample.session.id, sample.users.bob.id);
      expect(c.counter.n).toBe(5);
    } finally {
      await c.close();
    }
  });
});

describe("solutions viewer (§4.5, D2, AC-S-SEC-2)", () => {
  it("members open accepted code of a finished session; position and author must match the cell", async () => {
    const sample = await loadSampleSession();
    const { room, session, users } = sample;
    const s = await getSessionSolution(db(), room.id, session.id, users.bob.id, { username: "alice" }, "2");
    expect(s).toMatchObject({ author: { username: "alice" }, position: 2, solveSeconds: 1470, wrongBefore: 1, problem: { slug: "house-robber" } });
    // The submission shown is the first accepted one.
    const [res] = await db()
      .select({ id: roomSessionResults.firstAcceptedSubmissionId })
      .from(roomSessionResults)
      .where(sql`${roomSessionResults.sessionId} = ${session.id} AND ${roomSessionResults.userId} = ${users.alice.id} AND ${roomSessionResults.position} = 2`);
    const [sub] = await db().select().from(submissions).where(eq(submissions.id, res.id!));
    expect(sub.status).toBe("accepted");
    // Unsolved cells (alice P4 had only a TLE, bob P2 only a WA) and missing cells → null.
    expect(await getSessionSolution(db(), room.id, session.id, users.bob.id, { username: "alice" }, "4")).toBeNull();
    expect(await getSessionSolution(db(), room.id, session.id, users.alice.id, { username: "bob" }, "2")).toBeNull();
    expect(await getSessionSolution(db(), room.id, session.id, users.alice.id, { username: "bob" }, "9")).toBeNull();
    expect(await getSessionSolution(db(), room.id, session.id, users.alice.id, { username: "bob" }, "1x")).toBeNull();
    expect(await getSessionSolution(db(), room.id, session.id, users.alice.id, { username: "nobody_here" }, "1")).toBeNull();
  });

  it("opt-out hides a member's code from others, not from themselves; the results say why", async () => {
    const sample = await loadSampleSession();
    const { room, session, users } = sample;
    await db().update(roomMembers).set({ shareSolutions: false }).where(eq(roomMembers.userId, users.carol.id));
    expect(await getSessionSolution(db(), room.id, session.id, users.alice.id, { username: "carol" }, "1")).toBeNull();
    expect(await getSessionSolution(db(), room.id, session.id, users.carol.id, { username: "carol" }, "1")).toMatchObject({ viewerIsAuthor: true });
    const r = await finished(sample, "alice");
    expect(row(r, "carol").cells.map((c) => c.solution)).toEqual([
      { visible: false, reason: "opted_out" },
      { visible: false, reason: "opted_out" },
      { visible: false, reason: "opted_out" },
      { visible: false, reason: "unsolved" },
    ]);
    expect(row(r, "bob").cells[0].solution).toEqual({ visible: true });
  });

  it("room sharing off: nobody but the author", async () => {
    const sample = await loadSampleSession();
    const { room, session, users } = sample;
    await db().update(rooms).set({ shareSolutions: false }).where(eq(rooms.id, room.id));
    expect(await getSessionSolution(db(), room.id, session.id, users.alice.id, { username: "bob" }, "1")).toBeNull();
    expect(await getSessionSolution(db(), room.id, session.id, users.bob.id, { username: "bob" }, "1")).not.toBeNull();
    const r = await finished(sample, "alice");
    expect(row(r, "bob").cells[0].solution).toEqual({ visible: false, reason: "room_off" });
  });

  it("a removed member loses access, and their code stops being viewable", async () => {
    const sample = await loadSampleSession();
    const { room, session, users } = sample;
    await db().delete(roomMembers).where(eq(roomMembers.userId, users.bob.id));
    expect(await getSessionSolution(db(), room.id, session.id, users.bob.id, { username: "alice" }, "1")).toBeNull();
    expect(await getSessionResults(db(), room.id, session.id, users.bob.id)).toBeNull();
    expect(await getRoomHistory(db(), room.id, users.bob.id)).toBeNull();
    expect(await getRoomLeaderboard(db(), room.id, users.bob.id, "all")).toBeNull();
    expect(await getMemberTimeline(db(), room.id, users.bob.id, "alice")).toBeNull();
    // Others still see bob's results ("(left)"), but not his code.
    const r = await finished(sample, "alice");
    expect(row(r, "bob")).toMatchObject({ isMember: false, rank: 3 });
    expect(row(r, "bob").cells[0].solution).toEqual({ visible: false, reason: "author_left" });
    expect(await getSessionSolution(db(), room.id, session.id, users.alice.id, { username: "bob" }, "1")).toBeNull();
  });

  it("never exposes a non-accepted submission, even if a result row points at one", async () => {
    const sample = await loadSampleSession();
    const { room, session, users, problems } = sample;
    const wa = await createSessionSubmission({
      userId: users.bob.id,
      problemId: problems[1].id,
      roomSessionId: session.id,
      status: "wrong_answer",
      createdAt: new Date(session.startedAt!.getTime() + 60_000),
    });
    // Tamper bob's P2 cell into "solved" by that wrong answer.
    await db().execute(sql`
      UPDATE room_session_results SET first_accepted_submission_id = ${wa.id}, first_accepted_at = ${wa.createdAt.toISOString()}::timestamptz, solve_seconds = 60, attempts = 2
      WHERE session_id = ${session.id} AND user_id = ${users.bob.id} AND position = 2`);
    expect(await getSessionSolution(db(), room.id, session.id, users.alice.id, { username: "bob" }, "2")).toBeNull();
    // A cell pointing at someone else's accepted code is not served either.
    const [aliceP2] = await db()
      .select({ id: roomSessionResults.firstAcceptedSubmissionId })
      .from(roomSessionResults)
      .where(sql`${roomSessionResults.sessionId} = ${session.id} AND ${roomSessionResults.userId} = ${users.alice.id} AND ${roomSessionResults.position} = 2`);
    await db().execute(sql`
      UPDATE room_session_results SET first_accepted_submission_id = ${aliceP2.id}
      WHERE session_id = ${session.id} AND user_id = ${users.bob.id} AND position = 2`);
    expect(await getSessionSolution(db(), room.id, session.id, users.alice.id, { username: "bob" }, "2")).toBeNull();
  });

  it("not available while live (even with an accepted cell)", async () => {
    const { room, owner } = await createRoom();
    const bob = await createUser({ username: "bob_live" });
    await addRoomMember(room.id, bob.id);
    const p = await createProblem();
    const s = await createRoomSession({
      roomId: room.id,
      status: "live",
      startedAt: new Date(Date.now() - 10 * MIN),
      problems: [{ problemId: p.id, difficulty: "easy" }],
      participants: [owner.id, bob.id],
    });
    const sub = await createSessionSubmission({ userId: bob.id, problemId: p.id, roomSessionId: s.id, status: "accepted", createdAt: new Date(Date.now() - 5 * MIN) });
    await createSessionResult({ sessionId: s.id, userId: bob.id, position: 1, attempts: 1, firstAcceptedAt: sub.createdAt, firstAcceptedSubmissionId: sub.id, solveSeconds: 300 });
    expect(await getSessionSolution(db(), room.id, s.id, owner.id, { username: "bob_live" }, "1")).toBeNull();
    expect(await getSessionSolution(db(), room.id, s.id, bob.id, { username: "bob_live" }, "1")).toBeNull();
  });

  describe("GET /api/rooms/:roomId/sessions/:sid/solutions/:userId/:pos", () => {
    const call = (r: string, s: string, u: string, pos: string) =>
      solutionRoute(new Request(`${ORIGIN}/api/rooms/${r}/sessions/${s}/solutions/${u}/${pos}`), {
        params: Promise.resolve({ roomId: r, sessionId: s, userId: u, position: pos }),
      });
    async function signIn(userId: string | null) {
      state.cookies.clear();
      if (userId) state.cookies.set(SESSION_COOKIE, await signSessionToken(userId));
    }

    it("200 with the code for a member; identical 404 for every refusal; 401 for guests", async () => {
      const sample = await loadSampleSession();
      const { room, session, users } = sample;
      const outsider = await createUser({ username: "mallory" });
      const other = await createRoom({ owner: outsider });

      await signIn(users.bob.id);
      const ok = await call(room.id, session.id, users.alice.id, "1");
      expect(ok.status).toBe(200);
      expect(ok.headers.get("cache-control")).toBe("no-store");
      expect(await ok.json()).toEqual({ language: "python", code: "pass", runtimeMs: null, memoryKb: null });

      const refusals: Response[] = [
        await call(room.id, session.id, users.alice.id, "4"), // unsolved
        await call(room.id, UNKNOWN_ID, users.alice.id, "1"), // unknown session
        await call(other.room.id, session.id, users.alice.id, "1"), // session of another room (bob not a member there)
        await call(room.id, session.id, "not-a-uuid", "1"),
      ];
      await signIn(outsider.id);
      refusals.push(await call(room.id, session.id, users.alice.id, "1")); // non-member
      refusals.push(await call(other.room.id, session.id, users.alice.id, "1")); // cross-room id with own room
      const bodies = await Promise.all(refusals.map(async (r) => [r.status, await r.text()]));
      for (const b of bodies) expect(b).toEqual([404, JSON.stringify({ error: "Solution not found" })]);

      await signIn(null);
      expect((await call(room.id, session.id, users.alice.id, "1")).status).toBe(401);
    });
  });
});

describe("room history (§5.2, Q2)", () => {
  async function roomWithSessions(count: number) {
    const alice = await createUser({ username: "alice" });
    const bob = await createUser({ username: "bob" });
    const { room } = await createRoom({ owner: alice, members: [bob] });
    const p1 = await createProblem({ slug: "p-one", title: "P One", difficulty: "easy" });
    const p2 = await createProblem({ slug: "p-two", title: "P Two", difficulty: "hard" });
    const base = Date.now() - 400 * DAY;
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const s = await createRoomSession({
        roomId: room.id,
        hostId: alice.id,
        status: "finished",
        startedAt: new Date(base + i * DAY),
        problems: [
          { problemId: p1.id, difficulty: "easy" },
          { problemId: p2.id, difficulty: "hard" },
        ],
      });
      await addSessionParticipant(s.id, alice.id, { solvedCount: 2, penaltySec: 100, rank: 1 });
      if (i % 2 === 0) await addSessionParticipant(s.id, bob.id, { solvedCount: i % 4 === 0 ? 2 : 1, penaltySec: i % 4 === 0 ? 100 : 50, rank: i % 4 === 0 ? 1 : 2 });
      ids.push(s.id);
    }
    return { alice, bob, room, ids: ids.reverse() }; // newest first
  }

  it("newest first, 20 per page, problems and per-member results; page 2 and past the end", async () => {
    const { alice, bob, room, ids } = await roomWithSessions(23);
    const page1 = (await getRoomHistory(db(), room.id, bob.id))!;
    expect(page1.total).toBe(23);
    expect(page1.pageSize).toBe(20);
    expect(page1.sessions.map((s) => s.id)).toEqual(ids.slice(0, 20));
    const newest = page1.sessions[0]; // i = 22: bob took part, i % 4 = 2 → rank 2
    expect(newest).toMatchObject({
      status: "finished",
      participants: 2,
      winners: ["alice"],
      viewer: { solved: 1, rank: 2 },
      problems: [
        { position: 1, title: "P One", difficulty: "easy" },
        { position: 2, title: "P Two", difficulty: "hard" },
      ],
    });
    expect(page1.sessions[1]).toMatchObject({ participants: 1, viewer: null }); // i = 21, bob absent
    expect(page1.sessions[2].winners).toEqual(["alice", "bob"]); // i = 20: tie for rank 1

    const page2 = (await getRoomHistory(db(), room.id, alice.id, { page: 2 }))!;
    expect(page2.sessions.map((s) => s.id)).toEqual(ids.slice(20));
    expect(page2.total).toBe(23);

    const past = (await getRoomHistory(db(), room.id, alice.id, { page: 9 }))!;
    expect(past.sessions).toEqual([]);
    expect(past.total).toBe(23);
  });

  it("cancelled sessions are listed (no winners), open sessions are pinned separately", async () => {
    const { alice, room } = await roomWithSessions(1);
    const cancelled = await createRoomSession({ roomId: room.id, status: "cancelled" });
    const lobby = await createRoomSession({ roomId: room.id, hostId: alice.id, participants: [alice.id] });
    const h = (await getRoomHistory(db(), room.id, alice.id))!;
    expect(h.open).toEqual([expect.objectContaining({ id: lobby.id, status: "lobby", joined: 1, viewerJoined: true })]);
    expect(h.sessions.map((s) => [s.id === cancelled.id, s.status])).toEqual([
      [true, "cancelled"],
      [false, "finished"],
    ]);
    expect(h.sessions[0]).toMatchObject({ winners: [], viewer: null });
    expect(h.total).toBe(2);
  });

  it("a live session past its end moves from the pinned row to the list (lazy close)", async () => {
    const { alice, room } = await roomWithSessions(0);
    const p = await createProblem();
    const s = await createRoomSession({
      roomId: room.id,
      status: "live",
      startedAt: new Date(Date.now() - 2 * 60 * MIN),
      problems: [{ problemId: p.id, difficulty: "easy" }],
      participants: [alice.id],
    });
    const h = (await getRoomHistory(db(), room.id, alice.id))!;
    expect(h.open).toEqual([]);
    expect(h.sessions.map((x) => [x.id, x.status])).toEqual([[s.id, "finished"]]);
  });

  it("empty room: no sessions, total 0", async () => {
    const { room, owner } = await createRoom();
    expect(await getRoomHistory(db(), room.id, owner.id)).toEqual({ open: [], sessions: [], total: 0, page: 1, pageSize: 20 });
  });

  it("history budget (AC-S-HIS-2): ≤ 5 queries", async () => {
    const { alice, room } = await roomWithSessions(3);
    await createRoomSession({ roomId: room.id, hostId: alice.id, participants: [alice.id] });
    const c = countingDb();
    try {
      await getRoomHistory(c.db, room.id, alice.id);
      expect(c.counter.n).toBeLessThanOrEqual(5);
      expect(c.counter.n).toBe(5); // Q0, open session, page (+ total), participants, problems
    } finally {
      await c.close();
    }
  });
});

describe("leaderboard (§5.2, Q4, Q5)", () => {
  it("§6.4: one session; ties on solved + solve rate share a rank; calibration easy 3/3, medium 5/6, hard 0/3", async () => {
    const sample = await loadSampleSession();
    const lb = (await getRoomLeaderboard(db(), sample.room.id, sample.users.bob.id, "all"))!;
    expect(lb.sessions).toBe(1);
    expect(lb.rows.map((r) => [r.username, r.rank, r.sessions, r.solved, r.offered, r.wins, r.avgRank, r.solveRate])).toEqual([
      ["alice", 1, 1, 3, 4, 1, 1, 0.75],
      ["carol", 1, 1, 3, 4, 0, 2, 0.75],
      ["bob", 3, 1, 2, 4, 0, 3, 0.5],
    ]);
    expect(lb.calibration.sessions).toBe(1);
    expect(lb.calibration.counts).toEqual({
      easy: { solved: 3, pairs: 3 },
      medium: { solved: 5, pairs: 6 },
      hard: { solved: 0, pairs: 3 },
    });
  });

  it("matches Q5 by hand over several sessions; windows; members without sessions; people who left", async () => {
    const [ann, ben, cat, dan] = await Promise.all(["ann", "ben", "cat", "dan"].map((u) => createUser({ username: u })));
    const { room } = await createRoom({ owner: ann, members: [ben, cat, dan] });
    const p = await createProblem();
    const p2 = await createProblem();
    const p3 = await createProblem();
    const slots = [
      { problemId: p.id, difficulty: "easy" as const },
      { problemId: p2.id, difficulty: "medium" as const },
      { problemId: p3.id, difficulty: "hard" as const },
    ];
    // [daysAgo, [user, solved, rank][]]
    const plan: [number, [typeof ann, number, number][]][] = [
      [200, [[ann, 3, 1], [ben, 1, 2]]],
      [60, [[ann, 1, 2], [ben, 2, 1], [cat, 0, 3]]],
      [10, [[ann, 2, 1], [ben, 2, 1], [cat, 1, 3]]],
    ];
    for (const [daysAgo, people] of plan) {
      const s = await createRoomSession({ roomId: room.id, status: "finished", startedAt: new Date(Date.now() - daysAgo * DAY), problems: slots });
      for (const [u, solved, rank] of people) await addSessionParticipant(s.id, u.id, { solvedCount: solved, rank });
    }
    await db().delete(roomMembers).where(eq(roomMembers.userId, cat.id)); // cat left

    const all = (await getRoomLeaderboard(db(), room.id, ann.id, "all"))!;
    // By hand: ann 6/9 (wins 2, avg 4/3), ben 5/9 (wins 2, avg 4/3), cat 1/6 (avg 3), dan none.
    expect(all.rows.map((r) => [r.username, r.rank, r.sessions, r.solved, r.offered, r.wins, r.isMember])).toEqual([
      ["ann", 1, 3, 6, 9, 2, true],
      ["ben", 2, 3, 5, 9, 2, true],
      ["cat", 3, 2, 1, 6, 0, false],
      ["dan", null, 0, 0, 0, 0, true],
    ]);
    expect(all.rows[0].avgRank).toBeCloseTo(4 / 3, 6);
    expect(all.sessions).toBe(3);

    const threeMonths = (await getRoomLeaderboard(db(), room.id, ann.id, "3m"))!;
    expect(threeMonths.sessions).toBe(2);
    // ben 4/6 vs ann 3/6.
    expect(threeMonths.rows.map((r) => [r.username, r.rank, r.solved, r.offered])).toEqual([
      ["ben", 1, 4, 6],
      ["ann", 2, 3, 6],
      ["cat", 3, 1, 6],
      ["dan", null, 0, 0],
    ]);
    const fourWeeks = (await getRoomLeaderboard(db(), room.id, ann.id, "4w"))!;
    expect(fourWeeks.sessions).toBe(1);
    expect(fourWeeks.rows.slice(0, 2).map((r) => [r.username, r.rank])).toEqual([
      ["ann", 1],
      ["ben", 1],
    ]);
  });

  it("leaderboard budget: Q0, Q5, members, Q4 = 4 queries", async () => {
    const sample = await loadSampleSession();
    const c = countingDb();
    try {
      await getRoomLeaderboard(c.db, sample.room.id, sample.users.alice.id, "3m");
      expect(c.counter.n).toBe(4);
    } finally {
      await c.close();
    }
  });
});

describe("member timeline (§5.2, Q3)", () => {
  it("§6.4: alice's day reads 'solved Valid Anagram (6:10), House Robber (24:30, 1 wrong), Coin Change (51:00); not solved: Edit Distance'", async () => {
    const sample = await loadSampleSession();
    const t = (await getMemberTimeline(db(), sample.room.id, sample.users.carol.id, "alice"))!;
    expect(t.member).toMatchObject({ username: "alice", isMember: true });
    expect(t.room.name).toBe("Saturday Algo Club");
    expect(t.sessions).toHaveLength(1);
    const [s] = t.sessions;
    expect(s).toMatchObject({ rank: 1, participants: 3, solvedCount: 3 });
    expect(s.problems.map((p) => [p.slug, p.difficulty, p.solveSeconds, p.wrongBefore, p.attempts])).toEqual([
      ["valid-anagram", "easy", 370, 0, 1],
      ["house-robber", "medium", 1470, 1, 2],
      ["coin-change", "medium", 3060, 0, 1],
      ["edit-distance", "hard", null, 1, 1],
    ]);
    const bob = (await getMemberTimeline(db(), sample.room.id, sample.users.alice.id, "bob"))!;
    expect(bob.sessions[0].problems.map((p) => p.solveSeconds)).toEqual([240, null, 2400, null]);
  });

  it("404 cases: non-member viewer, unknown name, a user who never took part and is not a member; left members stay visible", async () => {
    const sample = await loadSampleSession();
    const outsider = await createUser({ username: "mallory" });
    const { room: other } = await createRoom({ owner: outsider });
    expect(await getMemberTimeline(db(), sample.room.id, outsider.id, "alice")).toBeNull();
    expect(await getMemberTimeline(db(), sample.room.id, sample.users.alice.id, "nobody")).toBeNull();
    expect(await getMemberTimeline(db(), sample.room.id, sample.users.alice.id, "mallory")).toBeNull();
    expect(await getMemberTimeline(db(), sample.room.id, sample.users.alice.id, "Bad Name!")).toBeNull();
    // Alice's room id, but asking through another room she is not in.
    expect(await getMemberTimeline(db(), other.id, sample.users.alice.id, "alice")).toBeNull();
    // Mallory's own room has no session of alice: alice is not a member there → null for mallory too.
    expect(await getMemberTimeline(db(), other.id, outsider.id, "alice")).toBeNull();
    // A member with no sessions yet: empty timeline, not 404.
    const newbie = await createUser({ username: "newbie" });
    await addRoomMember(sample.room.id, newbie.id);
    expect((await getMemberTimeline(db(), sample.room.id, sample.users.alice.id, "newbie"))?.sessions).toEqual([]);
    // Bob leaves: his past session stays visible to members.
    await db().delete(roomMembers).where(eq(roomMembers.userId, sample.users.bob.id));
    const bob = (await getMemberTimeline(db(), sample.room.id, sample.users.alice.id, "bob"))!;
    expect(bob.member.isMember).toBe(false);
    expect(bob.sessions).toHaveLength(1);
  });

  it("timeline budget: Q0, target, Q3 = 3 queries", async () => {
    const sample = await loadSampleSession();
    const c = countingDb();
    try {
      await getMemberTimeline(c.db, sample.room.id, sample.users.alice.id, "carol");
      expect(c.counter.n).toBe(3);
    } finally {
      await c.close();
    }
  });
});

describe("cross-room isolation (§8.2, AC-S-SEC-1)", () => {
  it("a member of room A cannot read room B's history, results, solutions, leaderboard or timeline", async () => {
    const sample = await loadSampleSession(); // room B (alice, bob, carol)
    const eve = await createUser({ username: "eve" });
    const { room: roomA } = await createRoom({ owner: eve });
    const p = await createProblem();
    const aSession = await createRoomSession({
      roomId: roomA.id,
      status: "finished",
      startedAt: new Date(Date.now() - 2 * DAY),
      problems: [{ problemId: p.id, difficulty: "easy" }],
      participants: [eve.id],
    });
    const B = sample.room.id;
    const bSession = sample.session.id;
    expect(await getRoomHistory(db(), B, eve.id)).toBeNull();
    expect(await getRoomLeaderboard(db(), B, eve.id, "all")).toBeNull();
    expect(await getSessionResults(db(), B, bSession, eve.id)).toBeNull();
    expect(await getSessionResults(db(), roomA.id, bSession, eve.id)).toBeNull(); // B's session through A's id
    expect(await getSessionSolution(db(), roomA.id, bSession, eve.id, { username: "alice" }, "1")).toBeNull();
    expect(await getSessionSolution(db(), B, bSession, eve.id, { username: "alice" }, "1")).toBeNull();
    expect(await getMemberTimeline(db(), B, eve.id, "alice")).toBeNull();
    expect(await getMemberTimeline(db(), roomA.id, eve.id, "alice")).toBeNull();
    // And the other way: alice (B) cannot reach A's session through B.
    expect(await getSessionResults(db(), B, aSession.id, sample.users.alice.id)).toBeNull();
    expect(await getSessionResults(db(), roomA.id, aSession.id, sample.users.alice.id)).toBeNull();
    // Eve's own room works.
    expect((await getSessionResults(db(), roomA.id, aSession.id, eve.id))?.kind).toBe("finished");
    expect((await getRoomHistory(db(), roomA.id, eve.id))?.sessions.map((s) => s.id)).toEqual([aSession.id]);
    // Malformed ids are null, not errors.
    expect(await getSessionResults(db(), "nope", bSession, eve.id)).toBeNull();
    expect(await getSessionResults(db(), B, "nope", sample.users.alice.id)).toBeNull();
  });
});
