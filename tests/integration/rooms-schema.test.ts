// AC-S-DB-2 / AC-S-DB-3: constraints, cascades, indexes and the key queries
// of the Rooms tables (migration 0003) on the real test database.
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { problems, roomEvents, roomMembers, rooms, roomSessionResults, roomSessions, submissions, users } from "@/server/db/schema";
import { requireRoomMember, requireSessionInRoom } from "@/server/rooms/access";

import { closeTestDb, createProblem, createSubmission, createUser, getTestDb, resetTestDb } from "../helpers/db";
import {
  addRoomMember,
  addSessionParticipant,
  createRoom,
  createRoomEvent,
  createRoomSession,
  createSessionResult,
  DEFAULT_SETTINGS,
  loadSampleSession,
} from "../helpers/rooms";

const UNIQUE = "23505";
const CHECK = "23514";
const FK = "23503";

async function pgCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.cause?.code ?? e.code ?? "unknown";
  }
  throw new Error("expected the query to fail");
}

/** Constraint name of a failed query. */
async function pgConstraint(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    const e = error as { constraint?: string; cause?: { constraint?: string } };
    return e.cause?.constraint ?? e.constraint;
  }
  throw new Error("expected the query to fail");
}

beforeEach(resetTestDb);
afterAll(closeTestDb);

const db = () => getTestDb();
const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

async function roomWithSession(status: "lobby" | "live" | "finished" = "live") {
  const { room, owner } = await createRoom();
  const problem = await createProblem({ difficulty: "medium" });
  const session = await createRoomSession({
    roomId: room.id,
    hostId: owner.id,
    status,
    problems: [{ problemId: problem.id, difficulty: "medium" }],
    participants: [owner.id],
  });
  return { room, owner, problem, session };
}

describe("rooms and members", () => {
  it("factory: creator is the owner", async () => {
    const { room, owner } = await createRoom();
    const members = await db().select().from(roomMembers).where(eq(roomMembers.roomId, room.id));
    expect(members).toEqual([expect.objectContaining({ userId: owner.id, role: "owner", shareSolutions: true })]);
    expect(room.shareSolutions).toBe(true);
  });

  it("second owner → unique violation; many members are fine", async () => {
    const { room } = await createRoom();
    const a = await createUser();
    const b = await createUser();
    await addRoomMember(room.id, a.id);
    await addRoomMember(room.id, b.id);
    expect(await pgConstraint(addRoomMember(room.id, (await createUser()).id, { role: "owner" }))).toBe(
      "room_members_one_owner",
    );
    expect(await pgCode(addRoomMember(room.id, a.id))).toBe(UNIQUE);
  });

  it("name length 1..60, invite hash format, hash/expiry pairing, unique hash", async () => {
    const owner = await createUser();
    const insert = (v: Partial<typeof rooms.$inferInsert>) =>
      db().insert(rooms).values({ name: "R", createdBy: owner.id, ...v });
    expect(await pgConstraint(insert({ name: "" }))).toBe("rooms_name_length");
    expect(await pgConstraint(insert({ name: "x".repeat(61) }))).toBe("rooms_name_length");
    await insert({ name: "x".repeat(60) });
    const expires = new Date(Date.now() + 86_400_000);
    expect(await pgConstraint(insert({ inviteTokenHash: "ABC", inviteExpiresAt: expires }))).toBe("rooms_invite_hash_format");
    expect(await pgConstraint(insert({ inviteTokenHash: "a".repeat(64) }))).toBe("rooms_invite_pair");
    expect(await pgConstraint(insert({ inviteExpiresAt: expires }))).toBe("rooms_invite_pair");
    await insert({ inviteTokenHash: "a".repeat(64), inviteExpiresAt: expires });
    expect(await pgCode(insert({ inviteTokenHash: "a".repeat(64), inviteExpiresAt: expires }))).toBe(UNIQUE);
    // Many rooms without a link (NULLs are distinct).
    await insert({});
    await insert({});
  });
});

describe("room_sessions", () => {
  it("one open session per room; finished/cancelled ones do not block", async () => {
    const { room } = await createRoom();
    await createRoomSession({ roomId: room.id, status: "finished" });
    await createRoomSession({ roomId: room.id, status: "cancelled" });
    await createRoomSession({ roomId: room.id, status: "lobby" });
    expect(await pgConstraint(createRoomSession({ roomId: room.id, status: "live" }))).toBe("room_sessions_one_open");
    expect(await pgConstraint(createRoomSession({ roomId: room.id, status: "lobby" }))).toBe("room_sessions_one_open");
    const other = await createRoom();
    await createRoomSession({ roomId: other.room.id, status: "live" });
  });

  it("duration 15..240 step 5, problem count 1..8, re-roll cap 30", async () => {
    const { room } = await createRoom();
    for (const durationMin of [17, 10, 245]) {
      expect(await pgConstraint(createRoomSession({ roomId: room.id, durationMin }))).toBe("room_sessions_duration");
    }
    for (const problemCount of [0, 9]) {
      expect(await pgConstraint(createRoomSession({ roomId: room.id, problemCount }))).toBe("room_sessions_count");
    }
    expect(await pgConstraint(createRoomSession({ roomId: room.id, rerollCount: 31 }))).toBe("room_sessions_reroll_cap");
    await createRoomSession({ roomId: room.id, durationMin: 240, problemCount: 8, rerollCount: 30 });
  });

  it("status, timestamps and end reason must agree", async () => {
    const { room } = await createRoom();
    const started = minutesAgo(30);
    const ends = new Date(started.getTime() + 90 * 60_000);
    const bad: Partial<typeof roomSessions.$inferInsert>[] = [
      { status: "lobby", startedAt: started, endsAt: ends },
      { status: "lobby", endsAt: ends },
      { status: "lobby", endReason: "time" },
      { status: "live", startedAt: started, endsAt: null },
      { status: "live", startedAt: null, endsAt: null },
      { status: "live", startedAt: started, endsAt: ends, endReason: "host" },
      { status: "finished", startedAt: started, endsAt: ends, endedAt: null, endReason: "time" },
      { status: "finished", startedAt: started, endsAt: ends, endedAt: ends, endReason: "stale" },
      { status: "finished", startedAt: started, endsAt: ends, endedAt: ends, endReason: null },
      { status: "cancelled", startedAt: started, endsAt: ends, endedAt: ends, endReason: "cancelled" },
      { status: "cancelled", endedAt: null, endReason: "cancelled" },
      { status: "cancelled", endedAt: new Date(), endReason: "time" },
    ];
    for (const values of bad) {
      expect(await pgCode(createRoomSession({ roomId: room.id, ...values })), JSON.stringify(values)).toBe(CHECK);
    }
    expect(await pgConstraint(createRoomSession({ roomId: room.id, status: "cancelled", endReason: "other" }))).toBe(
      "room_sessions_end_reason",
    );
    await createRoomSession({ roomId: room.id, status: "cancelled", endReason: "stale" });
  });

  it("ends_at must equal started_at + duration", async () => {
    const { room } = await createRoom();
    const started = minutesAgo(10);
    expect(
      await pgConstraint(
        createRoomSession({ roomId: room.id, status: "live", startedAt: started, durationMin: 90, endsAt: new Date(started.getTime() + 60 * 60_000) }),
      ),
    ).toBe("room_sessions_ends");
    await createRoomSession({ roomId: room.id, status: "live", startedAt: started, durationMin: 60 });
  });

  it("defaults: lobby, 90 min, 4 problems, empty re-roll list", async () => {
    const { room } = await createRoom();
    const [row] = await db().insert(roomSessions).values({ roomId: room.id, settings: DEFAULT_SETTINGS }).returning();
    expect(row).toMatchObject({ status: "lobby", durationMin: 90, problemCount: 4, rerolledProblemIds: [], rerollCount: 0, settings: DEFAULT_SETTINGS });
  });
});

describe("session problems, participants, results", () => {
  it("position 1..8, unique problem and position per session", async () => {
    const { room } = await createRoom();
    const p1 = await createProblem();
    const p2 = await createProblem();
    const s = await createRoomSession({ roomId: room.id, problems: [{ problemId: p1.id, difficulty: "easy" }] });
    const insert = (position: number, problemId: string) =>
      db().execute(sql`INSERT INTO room_session_problems (session_id, position, problem_id, difficulty) VALUES (${s.id}, ${position}, ${problemId}, 'easy')`);
    expect(await pgConstraint(insert(2, p1.id))).toBe("room_session_problems_unique_problem");
    expect(await pgCode(insert(1, p2.id))).toBe(UNIQUE);
    expect(await pgConstraint(insert(0, p2.id))).toBe("room_session_problems_position");
    expect(await pgConstraint(insert(9, p2.id))).toBe("room_session_problems_position");
    await insert(8, p2.id);
  });

  it("participant counters and rank bounds", async () => {
    const { session } = await roomWithSession();
    const u = await createUser();
    expect(await pgConstraint(addSessionParticipant(session.id, u.id, { rank: 0 }))).toBe("room_session_participants_nonneg");
    expect(await pgConstraint(addSessionParticipant(session.id, u.id, { solvedCount: 9 }))).toBe("room_session_participants_nonneg");
    expect(await pgConstraint(addSessionParticipant(session.id, u.id, { penaltySec: -1 }))).toBe("room_session_participants_nonneg");
  });

  it("results: solved pair, counts, and FKs to participant and slot", async () => {
    const { owner, session } = await roomWithSession();
    const base = { sessionId: session.id, userId: owner.id, position: 1 };
    const now = new Date();
    expect(await pgConstraint(createSessionResult({ ...base, attempts: 1, firstAcceptedAt: now }))).toBe("room_session_results_solved_pair");
    expect(await pgConstraint(createSessionResult({ ...base, attempts: 1, solveSeconds: 10 }))).toBe("room_session_results_solved_pair");
    expect(await pgConstraint(createSessionResult({ ...base, attempts: 1, wrongBeforeAccept: 2 }))).toBe("room_session_results_counts");
    expect(await pgConstraint(createSessionResult({ ...base, attempts: 1, wrongBeforeAccept: 1, firstAcceptedAt: now, solveSeconds: 5 }))).toBe(
      "room_session_results_counts",
    );
    expect(await pgConstraint(createSessionResult({ ...base, attempts: 1, firstAcceptedAt: now, solveSeconds: -1 }))).toBe("room_session_results_counts");
    const stranger = await createUser();
    expect(await pgConstraint(createSessionResult({ ...base, userId: stranger.id }))).toBe("room_session_results_participant_fk");
    expect(await pgConstraint(createSessionResult({ ...base, position: 2 }))).toBe("room_session_results_problem_fk");
    await createSessionResult({ ...base, attempts: 2, wrongBeforeAccept: 1, firstAcceptedAt: now, solveSeconds: 600 });
  });
});

describe("room_events", () => {
  it("duplicate problem_solved for (session, user, position) → unique violation", async () => {
    const { owner, session } = await roomWithSession();
    const solved = (position: number) =>
      createRoomEvent({
        sessionId: session.id,
        type: "problem_solved",
        actorUserId: owner.id,
        payload: { position, solveSeconds: 60, wrongBefore: 0, firstSolver: true, solvedCount: 1 },
      });
    await solved(1);
    expect(await pgConstraint(solved(1))).toBe("room_events_one_solve");
    await solved(2);
    // Other users and other event types are not limited.
    const other = await createUser();
    await createRoomEvent({ sessionId: session.id, type: "problem_solved", actorUserId: other.id, payload: { position: 1 } });
    for (let i = 0; i < 2; i++) {
      await createRoomEvent({ sessionId: session.id, type: "attempt_failed", actorUserId: owner.id, payload: { position: 1, attempts: 1 } });
    }
  });

  it("problem_solved needs a numeric position; payload ≤ 2 KB; ids increase", async () => {
    const { owner, session } = await roomWithSession();
    expect(
      await pgConstraint(createRoomEvent({ sessionId: session.id, type: "problem_solved", actorUserId: owner.id, payload: {} })),
    ).toBe("room_events_solve_position");
    expect(
      await pgConstraint(createRoomEvent({ sessionId: session.id, type: "problem_solved", actorUserId: owner.id, payload: { position: "1" } })),
    ).toBe("room_events_solve_position");
    expect(
      await pgConstraint(createRoomEvent({ sessionId: session.id, type: "lobby_updated", payload: { pad: "x".repeat(2100) } })),
    ).toBe("room_events_payload_size");
    const a = await createRoomEvent({ sessionId: session.id, type: "session_cancelled" });
    const b = await createRoomEvent({ sessionId: session.id, type: "session_cancelled" });
    expect(typeof a.id).toBe("bigint");
    expect(b.id > a.id).toBe(true);
    expect(a.payload).toEqual({});
  });
});

describe("submissions.room_session_id", () => {
  it("only submits may carry a session id", async () => {
    const { owner, problem, session } = await roomWithSession();
    expect(
      await pgConstraint(createSubmission({ userId: owner.id, problemId: problem.id, kind: "run", roomSessionId: session.id })),
    ).toBe("submissions_room_session_submit_only");
    await createSubmission({ userId: owner.id, problemId: problem.id, kind: "submit", roomSessionId: session.id });
    await createSubmission({ userId: owner.id, problemId: problem.id, kind: "run" });
  });

  it("an unknown session id → FK violation", async () => {
    const u = await createUser();
    const p = await createProblem();
    expect(await pgCode(createSubmission({ userId: u.id, problemId: p.id, roomSessionId: "00000000-0000-4000-8000-000000000000" }))).toBe(FK);
  });
});

describe("cascades", () => {
  it("deleting a room removes sessions, slots, participants, results, events, members; submissions stay with NULL", async () => {
    const sample = await loadSampleSession();
    const before = await db().$count(submissions);
    await db().delete(rooms).where(eq(rooms.id, sample.room.id));
    for (const table of ["room_members", "room_sessions", "room_session_problems", "room_session_participants", "room_session_results", "room_events"]) {
      const { rows } = await db().execute<{ n: number }>(sql.raw(`SELECT count(*)::int AS n FROM ${table}`));
      expect(rows[0].n, table).toBe(0);
    }
    expect(await db().$count(submissions)).toBe(before);
    expect(await db().$count(submissions, sql`${submissions.roomSessionId} IS NOT NULL`)).toBe(0);
    expect(await db().$count(users)).toBe(3);
  });

  it("deleting a problem used in a session is restricted", async () => {
    const { problem } = await roomWithSession("finished");
    expect(await pgConstraint(db().delete(problems).where(eq(problems.id, problem.id)))).toBe(
      "room_session_problems_problem_id_problems_id_fk",
    );
  });

  it("deleting a user removes their rows, keeps the room and nulls host/creator/actor", async () => {
    const sample = await loadSampleSession();
    const { alice, bob } = sample.users;
    await db().delete(users).where(eq(users.id, alice.id));
    const [room] = await db().select().from(rooms).where(eq(rooms.id, sample.room.id));
    expect(room.createdBy).toBeNull();
    const [session] = await db().select().from(roomSessions).where(eq(roomSessions.id, sample.session.id));
    expect(session.hostId).toBeNull();
    expect(await db().$count(roomMembers, eq(roomMembers.roomId, room.id))).toBe(2);
    expect(await db().$count(roomSessionResults, eq(roomSessionResults.userId, alice.id))).toBe(0);
    // bob's results keep their first accepted submission.
    const bobResults = await db().select().from(roomSessionResults).where(eq(roomSessionResults.userId, bob.id));
    expect(bobResults.filter((r) => r.firstAcceptedSubmissionId !== null)).toHaveLength(2);
    expect(await db().$count(roomEvents, sql`${roomEvents.actorUserId} IS NULL AND ${roomEvents.type} = 'problem_solved'`)).toBe(3);
  });

  it("deleting a submission keeps the result and nulls first_accepted_submission_id", async () => {
    const sample = await loadSampleSession();
    const [result] = await db()
      .select()
      .from(roomSessionResults)
      .where(sql`${roomSessionResults.userId} = ${sample.users.bob.id} AND ${roomSessionResults.position} = 1`);
    await db().delete(submissions).where(eq(submissions.id, result.firstAcceptedSubmissionId!));
    const [after] = await db()
      .select()
      .from(roomSessionResults)
      .where(sql`${roomSessionResults.userId} = ${sample.users.bob.id} AND ${roomSessionResults.position} = 1`);
    expect(after).toMatchObject({ firstAcceptedSubmissionId: null, solveSeconds: 240 });
  });
});

describe("indexes", () => {
  const EXPECTED: Record<string, RegExp> = {
    room_members_user_idx: /ON public\.room_members USING btree \(user_id, joined_at DESC( NULLS LAST)?\)/,
    room_members_one_owner: /UNIQUE INDEX .* ON public\.room_members USING btree \(room_id\) WHERE \(role = 'owner'::room_role\)/,
    room_sessions_one_open: /UNIQUE INDEX .* \(room_id\) WHERE \(status = ANY \(ARRAY\['lobby'::room_session_status, 'live'::room_session_status\]\)\)/,
    room_sessions_room_finished_idx: /\(room_id, started_at DESC( NULLS LAST)?\) WHERE \(status = 'finished'::room_session_status\)/,
    room_sessions_room_status_idx: /\(room_id, status\)/,
    room_session_problems_problem_idx: /\(problem_id\)/,
    room_session_participants_user_idx: /\(user_id, session_id\)/,
    room_session_results_submission_idx: /\(first_accepted_submission_id\) WHERE \(first_accepted_submission_id IS NOT NULL\)/,
    room_events_session_id_idx: /\(session_id, id\)/,
    room_events_one_solve: /UNIQUE INDEX .* \(session_id, actor_user_id, \(\(payload ->> 'position'::text\)\)\) WHERE \(\(type = 'problem_solved'::room_event_type\) AND \(\(payload ->> 'selfReported'::text\) IS NULL\)\)/,
    rooms_created_by_idx: /\(created_by, created_at\)/,
    rooms_invite_token_hash_unique: /UNIQUE INDEX .* \(invite_token_hash\)/,
    submissions_room_session_idx: /\(room_session_id, user_id, problem_id, created_at\) WHERE \(room_session_id IS NOT NULL\)/,
  };

  it("exist with the intended definitions", async () => {
    const { rows } = await db().execute<{ name: string; def: string }>(
      sql`SELECT indexname AS name, indexdef AS def FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const defs = new Map(rows.map((r) => [r.name, r.def]));
    for (const [name, pattern] of Object.entries(EXPECTED)) {
      expect(defs.get(name), name).toMatch(pattern);
    }
  });

  /** Plan of a query with sequential scans disabled: shows which index is usable. */
  async function plan(query: ReturnType<typeof sql>): Promise<string> {
    return db().transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL enable_seqscan = off`);
      const { rows } = await tx.execute<{ "QUERY PLAN": string }>(sql`EXPLAIN ${query}`);
      return rows.map((r) => r["QUERY PLAN"]).join("\n");
    });
  }

  it("key queries can use their intended indexes (Q0, Q2, Q3, Q6, Q7, Q9, Q10, Q12)", async () => {
    const s = await loadSampleSession();
    const r = s.room.id;
    const u = s.users.alice.id;
    const p = s.problems[0].id;
    expect(await plan(sql`SELECT role FROM room_members WHERE room_id = ${r} AND user_id = ${u}`)).toMatch(
      /room_members_room_id_user_id_pk|room_members_user_idx/,
    );
    expect(
      await plan(sql`SELECT id FROM room_sessions WHERE room_id = ${r} AND status = 'finished' ORDER BY started_at DESC LIMIT 20`),
    ).toMatch(/room_sessions_room_finished_idx/);
    expect(await plan(sql`SELECT session_id FROM room_session_participants WHERE user_id = ${u}`)).toMatch(
      /room_session_participants_user_idx/,
    );
    expect(await plan(sql`SELECT id FROM room_events WHERE session_id = ${s.session.id} AND id > 5 ORDER BY id LIMIT 101`)).toMatch(
      /room_events_session_id_idx/,
    );
    expect(await plan(sql`SELECT id FROM room_sessions WHERE room_id = ${r} AND status IN ('live', 'finished')`)).toMatch(
      /room_sessions_room_status_idx/,
    );
    expect(
      await plan(
        sql`SELECT id FROM submissions WHERE room_session_id = ${s.session.id} AND user_id = ${u} AND problem_id = ${p} AND kind = 'submit' AND status NOT IN ('queued', 'running') ORDER BY created_at, id`,
      ),
    ).toMatch(/submissions_room_session_idx/);
    expect(
      await plan(sql`SELECT count(*) FROM submissions WHERE room_session_id = ${s.session.id} AND status IN ('queued', 'running')`),
    ).toMatch(/submissions_room_session_idx/);
    expect(await plan(sql`SELECT id FROM rooms WHERE invite_token_hash = ${"a".repeat(64)}`)).toMatch(/rooms_invite_token_hash_unique/);
  });
});

describe("§6.4 sample through the factories (AC-S-DB-3)", () => {
  it("Q2 history: one finished session with ranks and problems", async () => {
    const s = await loadSampleSession();
    const { rows: sessions } = await db().execute<{ id: string; problem_count: number; duration_min: number }>(sql`
      SELECT s.id, s.problem_count, s.duration_min FROM room_sessions s
      WHERE s.room_id = ${s.room.id} AND s.status = 'finished' ORDER BY s.started_at DESC LIMIT 20 OFFSET 0`);
    expect(sessions).toEqual([{ id: s.session.id, problem_count: 4, duration_min: 90 }]);
    const { rows: participants } = await db().execute<{ username: string; solved_count: number; penalty_sec: number; rank: number }>(sql`
      SELECT u.username, p.solved_count, p.penalty_sec, p.rank FROM room_session_participants p JOIN users u ON u.id = p.user_id
      WHERE p.session_id = ANY(${`{${s.session.id}}`}::uuid[]) ORDER BY p.rank`);
    expect(participants).toEqual([
      { username: "alice", solved_count: 3, penalty_sec: 5200, rank: 1 },
      { username: "carol", solved_count: 3, penalty_sec: 8510, rank: 2 },
      { username: "bob", solved_count: 2, penalty_sec: 2640, rank: 3 },
    ]);
    const { rows: slots } = await db().execute<{ position: number; title: string; difficulty: string; pinned: boolean }>(sql`
      SELECT sp.position, pr.title, sp.difficulty, sp.pinned FROM room_session_problems sp JOIN problems pr ON pr.id = sp.problem_id
      WHERE sp.session_id = ANY(${`{${s.session.id}}`}::uuid[]) ORDER BY sp.position`);
    expect(slots).toEqual([
      { position: 1, title: "valid-anagram", difficulty: "easy", pinned: false },
      { position: 2, title: "house-robber", difficulty: "medium", pinned: false },
      { position: 3, title: "coin-change", difficulty: "medium", pinned: true },
      { position: 4, title: "edit-distance", difficulty: "hard", pinned: false },
    ]);
  });

  it("Q3 timeline: alice solved 3 of 4 with the documented times", async () => {
    const s = await loadSampleSession();
    const { rows } = await db().execute<{ rank: number; position: number; title: string; solve_seconds: number | null; wrong_before_accept: number | null }>(sql`
      SELECT p.rank, sp.position, pr.title, res.solve_seconds, res.wrong_before_accept
      FROM room_session_participants p
      JOIN room_sessions s ON s.id = p.session_id AND s.room_id = ${s.room.id} AND s.status = 'finished'
      JOIN room_session_problems sp ON sp.session_id = s.id
      JOIN problems pr ON pr.id = sp.problem_id
      LEFT JOIN room_session_results res ON (res.session_id, res.user_id, res.position) = (s.id, p.user_id, sp.position)
      WHERE p.user_id = ${s.users.alice.id}
      ORDER BY s.started_at DESC, sp.position LIMIT 200`);
    expect(rows).toEqual([
      { rank: 1, position: 1, title: "valid-anagram", solve_seconds: 370, wrong_before_accept: 0 },
      { rank: 1, position: 2, title: "house-robber", solve_seconds: 1470, wrong_before_accept: 1 },
      { rank: 1, position: 3, title: "coin-change", solve_seconds: 3060, wrong_before_accept: 0 },
      { rank: 1, position: 4, title: "edit-distance", solve_seconds: null, wrong_before_accept: 1 },
    ]);
  });

  it("Q4 calibration: easy 3/3, medium 5/6, hard 0/3", async () => {
    const s = await loadSampleSession();
    const { rows } = await db().execute<{ difficulty: string; pairs: number; solved: number }>(sql`
      WITH recent AS (SELECT id FROM room_sessions WHERE room_id = ${s.room.id} AND status = 'finished' ORDER BY started_at DESC LIMIT 6),
      active AS (SELECT DISTINCT res.session_id, res.user_id FROM room_session_results res JOIN recent ON recent.id = res.session_id WHERE res.attempts > 0)
      SELECT sp.difficulty, count(*)::int AS pairs, count(res.first_accepted_at)::int AS solved
      FROM active a JOIN room_session_problems sp ON sp.session_id = a.session_id
      LEFT JOIN room_session_results res ON (res.session_id, res.user_id, res.position) = (a.session_id, a.user_id, sp.position)
      GROUP BY sp.difficulty ORDER BY sp.difficulty`);
    expect(rows).toEqual([
      { difficulty: "easy", pairs: 3, solved: 3 },
      { difficulty: "medium", pairs: 6, solved: 5 },
      { difficulty: "hard", pairs: 3, solved: 0 },
    ]);
  });

  it("Q5 leaderboard", async () => {
    const s = await loadSampleSession();
    const { rows } = await db().execute<{ username: string; sessions: number; solved: number; offered: number; wins: number }>(sql`
      SELECT u.username, count(*)::int AS sessions, sum(p.solved_count)::int AS solved, sum(s.problem_count)::int AS offered,
             (count(*) FILTER (WHERE p.rank = 1))::int AS wins
      FROM room_session_participants p JOIN room_sessions s ON s.id = p.session_id JOIN users u ON u.id = p.user_id
      WHERE s.room_id = ${s.room.id} AND s.status = 'finished' AND s.started_at >= ${new Date("2026-01-01T00:00:00Z").toISOString()}::timestamptz
      GROUP BY p.user_id, u.username
      ORDER BY sum(p.solved_count) DESC, sum(p.solved_count)::float / sum(s.problem_count) DESC, u.username`);
    expect(rows).toEqual([
      { username: "alice", sessions: 1, solved: 3, offered: 4, wins: 1 },
      { username: "carol", sessions: 1, solved: 3, offered: 4, wins: 0 },
      { username: "bob", sessions: 1, solved: 2, offered: 4, wins: 0 },
    ]);
  });

  it("Q6 replay: everything after a cursor, in order, with usernames", async () => {
    const s = await loadSampleSession();
    expect(s.eventIds).toHaveLength(18);
    const cursor = s.eventIds[4]; // session_started
    const { rows } = await db().execute<{ id: string; type: string; username: string | null }>(sql`
      SELECT e.id::text AS id, e.type, u.username FROM room_events e LEFT JOIN users u ON u.id = e.actor_user_id
      WHERE e.session_id = ${s.session.id} AND e.id > ${cursor.toString()}::bigint ORDER BY e.id LIMIT 101`);
    expect(rows).toHaveLength(13);
    expect(rows[0]).toMatchObject({ type: "problem_solved", username: "bob" });
    expect(rows.at(-2)).toMatchObject({ type: "session_ended", username: null });
    expect(rows.at(-1)).toMatchObject({ type: "problem_solved", username: "carol" });
    expect(rows.filter((r) => r.type === "problem_solved")).toHaveLength(8);
  });
});

describe("access helpers", () => {
  it("requireRoomMember: members only; malformed ids are null", async () => {
    const { room, owner } = await createRoom({ name: "Club" });
    const member = await createUser();
    await addRoomMember(room.id, member.id, { shareSolutions: false });
    const stranger = await createUser();
    expect(await requireRoomMember(db(), room.id, owner.id)).toEqual({
      roomId: room.id,
      roomName: "Club",
      userId: owner.id,
      role: "owner",
      roomShareSolutions: true,
      memberShareSolutions: true,
    });
    expect(await requireRoomMember(db(), room.id, member.id)).toMatchObject({ role: "member", memberShareSolutions: false });
    expect(await requireRoomMember(db(), room.id, stranger.id)).toBeNull();
    expect(await requireRoomMember(db(), "not-a-uuid", owner.id)).toBeNull();
  });

  it("requireSessionInRoom: a session of another room is null (IDOR)", async () => {
    const a = await roomWithSession("lobby");
    const b = await roomWithSession("lobby");
    expect((await requireSessionInRoom(db(), a.room.id, a.session.id))?.id).toBe(a.session.id);
    expect(await requireSessionInRoom(db(), a.room.id, b.session.id)).toBeNull();
    expect(await requireSessionInRoom(db(), a.room.id, "x")).toBeNull();
  });
});
