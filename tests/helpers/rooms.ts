// Factories for the Rooms tables (docs/specs/rooms.md §6) for integration
// tests of R1–R5. Status-consistent timestamps are filled in automatically so
// every factory row satisfies the CHECK constraints unless a test overrides
// them on purpose.
import { sql } from "drizzle-orm";

import { computeCellOutcome, scoreSession, type ScoringSubmission } from "@/lib/rooms/scoring";
import { computeEndsAt } from "@/lib/rooms/session-state";
import type { Difficulty, RoomSessionSettings } from "@/lib/rooms/types";
import {
  roomEvents,
  roomMembers,
  rooms,
  roomSessionParticipants,
  roomSessionProblems,
  roomSessionResults,
  roomSessions,
  submissions,
} from "@/server/db/schema";

import { createProblem, createUser, getTestDb } from "./db";

type NewRoom = typeof rooms.$inferInsert;
type NewSession = typeof roomSessions.$inferInsert;
type NewResult = typeof roomSessionResults.$inferInsert;
type NewEvent = typeof roomEvents.$inferInsert;
type RoomRow = typeof rooms.$inferSelect;
type SessionRow = typeof roomSessions.$inferSelect;
type UserRow = Awaited<ReturnType<typeof createUser>>;
type ProblemRow = Awaited<ReturnType<typeof createProblem>>;

let seq = 0;

export const DEFAULT_SETTINGS: RoomSessionSettings = {
  tags: [],
  mixMode: "suggested",
  mix: { easy: 1, medium: 2, hard: 1 },
  challenge: "balanced",
  avoidSolved: true,
};

/** Room with its owner as a member (owner created if not given). */
export async function createRoom(
  overrides: Partial<NewRoom> & { owner?: UserRow; members?: UserRow[] } = {},
): Promise<{ room: RoomRow; owner: UserRow }> {
  const { owner: givenOwner, members = [], ...values } = overrides;
  const owner = givenOwner ?? (await createUser());
  const db = getTestDb();
  const [room] = await db
    .insert(rooms)
    .values({ name: `Room ${++seq}`, createdBy: owner.id, ...values })
    .returning();
  await db.insert(roomMembers).values({ roomId: room.id, userId: owner.id, role: "owner" });
  for (const m of members) await addRoomMember(room.id, m.id);
  return { room, owner };
}

export async function addRoomMember(
  roomId: string,
  userId: string,
  overrides: Partial<typeof roomMembers.$inferInsert> = {},
) {
  const [row] = await getTestDb()
    .insert(roomMembers)
    .values({ roomId, userId, role: "member", ...overrides })
    .returning();
  return row;
}

export type SessionProblemInput = {
  problemId: string;
  difficulty: Difficulty;
  pinned?: boolean;
};

/**
 * A session in any state. `startedAt` defaults to one hour ago for
 * live/finished; `endsAt` = startedAt + duration; finished sets
 * `ended_at = ends_at`, `end_reason = 'time'`; cancelled sets `ended_at = now`.
 */
export async function createRoomSession(
  values: Pick<NewSession, "roomId"> &
    Partial<NewSession> & {
      problems?: SessionProblemInput[];
      participants?: string[];
    },
): Promise<SessionRow> {
  const { problems: slotProblems = [], participants = [], ...rest } = values;
  const status = rest.status ?? "lobby";
  const durationMin = rest.durationMin ?? 90;
  const started = status === "live" || status === "finished";
  // Explicit nulls in `values` are kept (tests of the CHECKs pass them on purpose).
  const startedAt =
    rest.startedAt !== undefined ? rest.startedAt : started ? new Date(Date.now() - 60 * 60 * 1000) : null;
  const endsAt =
    rest.endsAt !== undefined ? rest.endsAt : startedAt && started ? computeEndsAt(startedAt, durationMin) : null;
  const defaults: Partial<NewSession> = {
    startedAt,
    endsAt,
    endedAt: status === "finished" ? endsAt : status === "cancelled" ? new Date() : null,
    endReason: status === "finished" ? "time" : status === "cancelled" ? "cancelled" : null,
  };
  const db = getTestDb();
  const [session] = await db
    .insert(roomSessions)
    .values({
      settings: DEFAULT_SETTINGS,
      problemCount: slotProblems.length || 4,
      durationMin,
      ...defaults,
      ...rest,
      status,
    })
    .returning();
  if (slotProblems.length > 0) {
    await db.insert(roomSessionProblems).values(
      slotProblems.map((p, i) => ({
        sessionId: session.id,
        position: i + 1,
        problemId: p.problemId,
        difficulty: p.difficulty,
        pinned: p.pinned ?? false,
      })),
    );
  }
  for (const userId of participants) await addSessionParticipant(session.id, userId);
  return session;
}

export async function addSessionParticipant(
  sessionId: string,
  userId: string,
  overrides: Partial<typeof roomSessionParticipants.$inferInsert> = {},
) {
  const [row] = await getTestDb()
    .insert(roomSessionParticipants)
    .values({ sessionId, userId, ...overrides })
    .returning();
  return row;
}

export async function createSessionResult(values: NewResult) {
  const [row] = await getTestDb().insert(roomSessionResults).values(values).returning();
  return row;
}

/** Raw event insert (R3's appendRoomEvent adds locking and validation on top). */
export async function createRoomEvent(values: NewEvent) {
  const [row] = await getTestDb().insert(roomEvents).values(values).returning();
  return row;
}

/** A judged session submit with explicit `created_at`. */
export async function createSessionSubmission(values: {
  userId: string;
  problemId: string;
  roomSessionId: string | null;
  status: (typeof submissions.$inferInsert)["status"];
  createdAt: Date;
}) {
  const final = values.status !== "queued" && values.status !== "running";
  const [row] = await getTestDb()
    .insert(submissions)
    .values({
      kind: "submit",
      language: "python",
      code: "pass",
      ...values,
      startedAt: values.status === "running" || final ? values.createdAt : null,
      finishedAt: final ? new Date(values.createdAt.getTime() + 2000) : null,
    })
    .returning();
  return row;
}

/** Moves a session's time window, keeping the CHECKs satisfied (test-only time travel). */
export async function shiftSessionWindow(sessionId: string, startedAt: Date) {
  await getTestDb().execute(sql`
    UPDATE room_sessions
    SET started_at = ${startedAt.toISOString()}::timestamptz,
        ends_at = ${startedAt.toISOString()}::timestamptz + make_interval(mins => duration_min::int),
        ended_at = CASE WHEN status = 'finished'
                        THEN ${startedAt.toISOString()}::timestamptz + make_interval(mins => duration_min::int)
                        ELSE ended_at END
    WHERE id = ${sessionId}
  `);
}

// --- Spec §6.4 sample: "Saturday Algo Club", one finished weekly session ---

export const SAMPLE_STARTED_AT = new Date("2026-10-24T18:00:00Z");
const at = (hms: string) => new Date(`2026-10-24T${hms}Z`);

type SampleUser = "alice" | "bob" | "carol";
type FinalStatus = Exclude<(typeof submissions.$inferInsert)["status"], "queued" | "running" | undefined>;

export const SAMPLE_SUBMISSIONS: { user: SampleUser; position: number; created: string; status: FinalStatus }[] = [
  { user: "bob", position: 1, created: "18:04:00", status: "accepted" },
  { user: "alice", position: 1, created: "18:06:10", status: "accepted" },
  { user: "carol", position: 1, created: "18:08:00", status: "wrong_answer" },
  { user: "carol", position: 1, created: "18:12:00", status: "accepted" },
  { user: "alice", position: 2, created: "18:20:00", status: "wrong_answer" },
  { user: "alice", position: 2, created: "18:24:30", status: "accepted" },
  { user: "carol", position: 2, created: "18:35:00", status: "accepted" },
  { user: "bob", position: 3, created: "18:40:00", status: "accepted" },
  { user: "bob", position: 2, created: "18:45:00", status: "compile_error" },
  { user: "bob", position: 2, created: "18:50:00", status: "wrong_answer" },
  { user: "alice", position: 3, created: "18:51:00", status: "accepted" },
  { user: "alice", position: 4, created: "19:10:00", status: "time_limit" },
  { user: "carol", position: 3, created: "19:29:50", status: "accepted" },
];

export type SampleSession = {
  room: RoomRow;
  session: SessionRow;
  users: Record<SampleUser, UserRow>;
  problems: ProblemRow[];
  eventIds: bigint[];
};

/**
 * Loads §6.4 through the factories: results and participant totals are
 * computed with the pure core (computeCellOutcome, scoreSession), exactly as
 * R3's outcome code will do.
 */
export async function loadSampleSession(): Promise<SampleSession> {
  const db = getTestDb();
  const users = {
    alice: await createUser({ username: "alice", email: "alice@example.com" }),
    bob: await createUser({ username: "bob", email: "bob@example.com" }),
    carol: await createUser({ username: "carol", email: "carol@example.com" }),
  };
  const specs: [string, Difficulty][] = [
    ["valid-anagram", "easy"],
    ["house-robber", "medium"],
    ["coin-change", "medium"],
    ["edit-distance", "hard"],
  ];
  const problems: ProblemRow[] = [];
  for (const [slug, difficulty] of specs) {
    problems.push(await createProblem({ slug, title: slug, difficulty }));
  }
  const { room } = await createRoom({
    name: "Saturday Algo Club",
    owner: users.alice,
    members: [users.bob, users.carol],
  });
  const session = await createRoomSession({
    roomId: room.id,
    hostId: users.alice.id,
    status: "finished",
    startedAt: SAMPLE_STARTED_AT,
    rerollCount: 1,
    problems: problems.map((p, i) => ({ problemId: p.id, difficulty: p.difficulty, pinned: i === 2 })),
    participants: [users.alice.id, users.bob.id, users.carol.id],
  });
  const window = { startedAt: session.startedAt!, endsAt: session.endsAt! };

  const byCell = new Map<string, ScoringSubmission[]>();
  for (const s of SAMPLE_SUBMISSIONS) {
    const row = await createSessionSubmission({
      userId: users[s.user].id,
      problemId: problems[s.position - 1].id,
      roomSessionId: session.id,
      status: s.status,
      createdAt: at(s.created),
    });
    const key = `${s.user}:${s.position}`;
    byCell.set(key, [...(byCell.get(key) ?? []), { id: row.id, status: row.status, createdAt: row.createdAt }]);
  }

  const cells: Record<string, { position: number; wrongBefore: number; solveSeconds: number | null; firstAcceptedAt: Date | null }[]> = {
    alice: [],
    bob: [],
    carol: [],
  };
  for (const [key, subs] of byCell) {
    const [user, pos] = key.split(":") as [SampleUser, string];
    const outcome = computeCellOutcome(subs, window);
    if (outcome.attempts === 0 && outcome.firstAcceptedAt === null) continue; // only ignored submits
    await createSessionResult({
      sessionId: session.id,
      userId: users[user].id,
      position: Number(pos),
      attempts: outcome.attempts,
      wrongBeforeAccept: outcome.wrongBefore,
      firstAcceptedAt: outcome.firstAcceptedAt,
      firstAcceptedSubmissionId: outcome.firstAcceptedSubmissionId,
      solveSeconds: outcome.solveSeconds,
    });
    cells[user].push({ position: Number(pos), ...outcome });
  }
  const score = scoreSession(
    (["alice", "bob", "carol"] as const).map((u) => ({ userId: users[u].id, username: u, cells: cells[u] })),
  );
  for (const p of score.participants) {
    await db.execute(sql`
      UPDATE room_session_participants
      SET solved_count = ${p.solvedCount}, penalty_sec = ${p.penaltySec}, rank = ${p.rank}
      WHERE session_id = ${session.id} AND user_id = ${p.userId}
    `);
  }

  const solved = (user: SampleUser, position: number, solveSeconds: number, wrongBefore: number, firstSolver: boolean, solvedCount: number) =>
    ({ type: "problem_solved", actorUserId: users[user].id, payload: { position, solveSeconds, wrongBefore, firstSolver, solvedCount } }) as const;
  const failed = (user: SampleUser, position: number, attempts: number) =>
    ({ type: "attempt_failed", actorUserId: users[user].id, payload: { position, attempts } }) as const;
  const events: Omit<NewEvent, "sessionId">[] = [
    { type: "participant_joined", actorUserId: users.alice.id },
    { type: "participant_joined", actorUserId: users.bob.id },
    { type: "lobby_updated", payload: { problemCount: 4, durationMin: 90 } },
    { type: "participant_joined", actorUserId: users.carol.id },
    { type: "session_started", payload: { startedAt: window.startedAt.toISOString(), endsAt: window.endsAt.toISOString() } },
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
    { type: "session_ended", payload: { endedAt: window.endsAt.toISOString(), reason: "time" } },
    solved("carol", 3, 5390, 0, false, 3),
  ];
  const eventIds: bigint[] = [];
  for (const e of events) eventIds.push((await createRoomEvent({ ...e, sessionId: session.id })).id);

  return { room, session, users, problems, eventIds };
}
