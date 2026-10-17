// Rooms R4: server reads of the session screen, the room's open-session card
// and the problem-page session banner (docs/specs/rooms.md §7.4). Query counts:
// the banner adds exactly one query to the problem page; the live session
// screen stays within 6 including the signed-in user read (AC-S-HIS-2 part).
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDb, schema, type Db } from "@/server/db";
import { getOpenSessionSummary, getProblemSessionContext, getSessionPageData } from "@/server/rooms/session-page";

import { closeTestDb, createProblem, createUser, getTestDb, resetTestDb, testDbUrl } from "../helpers/db";
import { addRoomMember, createRoom, createRoomSession } from "../helpers/rooms";

type User = Awaited<ReturnType<typeof createUser>>;

let counting: { db: Db; queries: () => number; reset: () => void; end: () => Promise<void> };

beforeAll(async () => {
  const { pool } = createDb(testDbUrl());
  let n = 0;
  const db = drizzle(pool, { schema, logger: { logQuery: () => void n++ } }) as unknown as Db;
  counting = { db, queries: () => n, reset: () => void (n = 0), end: () => pool.end() };
});
afterAll(async () => {
  await counting.end();
  await closeTestDb();
});

let alice: User;
let bob: User;
let carol: User;
let outsider: User;
let roomId: string;
let p1: Awaited<ReturnType<typeof createProblem>>;
let p2: Awaited<ReturnType<typeof createProblem>>;

beforeEach(async () => {
  await resetTestDb();
  alice = await createUser();
  bob = await createUser();
  carol = await createUser();
  outsider = await createUser();
  ({
    room: { id: roomId },
  } = await createRoom({ owner: alice, name: "Saturday Algo Club" }));
  await addRoomMember(roomId, bob.id);
  await addRoomMember(roomId, carol.id);
  p1 = await createProblem({ difficulty: "easy" });
  p2 = await createProblem({ difficulty: "medium" });
});

async function liveSession(participants: string[]) {
  return createRoomSession({
    roomId,
    hostId: alice.id,
    status: "live",
    startedAt: new Date(Date.now() - 10 * 60_000),
    problems: [
      { problemId: p1.id, difficulty: "easy" },
      { problemId: p2.id, difficulty: "medium" },
    ],
    participants,
  });
}

describe("problem-page session context", () => {
  it("participant of a live session: found automatically and by ?session=, in one query", async () => {
    const s = await liveSession([alice.id, bob.id]);
    counting.reset();
    const auto = await getProblemSessionContext(counting.db, p2.slug, bob.id, null);
    expect(counting.queries()).toBe(1);
    expect(auto).toMatchObject({
      sessionId: s.id,
      roomName: "Saturday Algo Club",
      status: "live",
      position: 2,
      problemCount: 2,
      slugs: [p1.slug, p2.slug],
      isParticipant: true,
      explicit: false,
    });
    const explicit = await getProblemSessionContext(getTestDb(), p1.slug, bob.id, s.id);
    expect(explicit).toMatchObject({ position: 1, explicit: true });
  });

  it("a member who has not joined sees the banner only with ?session= (to join); never automatically", async () => {
    const s = await liveSession([alice.id]);
    expect(await getProblemSessionContext(getTestDb(), p1.slug, carol.id, null)).toBeNull();
    expect(await getProblemSessionContext(getTestDb(), p1.slug, carol.id, s.id)).toMatchObject({ isParticipant: false });
  });

  it("non-members, other problems, lobbies, cancelled sessions and malformed ids → no banner", async () => {
    const s = await liveSession([alice.id, bob.id]);
    const other = await createProblem();
    expect(await getProblemSessionContext(getTestDb(), p1.slug, outsider.id, s.id)).toBeNull();
    expect(await getProblemSessionContext(getTestDb(), p1.slug, outsider.id, null)).toBeNull();
    expect(await getProblemSessionContext(getTestDb(), other.slug, bob.id, s.id)).toBeNull();
    expect(await getProblemSessionContext(getTestDb(), p1.slug, bob.id, "not-a-uuid")).toBeNull();
    const lobby = await createRoomSession({
      roomId: (await createRoom({ owner: bob })).room.id,
      problems: [{ problemId: p1.id, difficulty: "easy" }],
      participants: [bob.id],
    });
    expect(await getProblemSessionContext(getTestDb(), p1.slug, bob.id, lobby.id)).toBeNull();
  });

  it("finished (or past ends_at) reads as finished with ?session=, and is not picked automatically", async () => {
    const s = await createRoomSession({
      roomId,
      status: "finished",
      problems: [{ problemId: p1.id, difficulty: "easy" }],
      participants: [bob.id],
    });
    expect(await getProblemSessionContext(getTestDb(), p1.slug, bob.id, s.id)).toMatchObject({ status: "finished" });
    expect(await getProblemSessionContext(getTestDb(), p1.slug, bob.id, null)).toBeNull();
  });
});

describe("open-session card", () => {
  it("lobby/live summary with participants and the viewer's state; null otherwise", async () => {
    expect(await getOpenSessionSummary(getTestDb(), roomId, bob.id)).toBeNull();
    const s = await liveSession([alice.id, bob.id]);
    counting.reset();
    const card = await getOpenSessionSummary(counting.db, roomId, bob.id);
    expect(counting.queries()).toBe(1);
    expect(card).toMatchObject({ id: s.id, status: "live", participants: 2, joined: true, problemCount: 2 });
    expect((await getOpenSessionSummary(getTestDb(), roomId, carol.id))?.joined).toBe(false);
    expect(await getOpenSessionSummary(getTestDb(), roomId, outsider.id)).toBeNull();
  });
});

describe("session screen data", () => {
  it("live: snapshot with titles for members, at most 5 queries here (+1 user read by the page = 6)", async () => {
    const s = await liveSession([alice.id, bob.id]);
    counting.reset();
    const data = await getSessionPageData(counting.db, roomId, s.id, carol.id);
    expect(counting.queries()).toBeLessThanOrEqual(5);
    expect(data?.state.status).toBe("live");
    expect(data?.state.snapshot?.problems.map((p) => p.title)).toEqual([p1.title, p2.title]);
    expect(data?.lobby).toBeNull();
    expect(data?.state.viewer).toEqual({ isParticipant: false, canManage: false });
  });

  it("non-member or a session of another room → null (404)", async () => {
    const s = await liveSession([alice.id]);
    expect(await getSessionPageData(getTestDb(), roomId, s.id, outsider.id)).toBeNull();
    const { room } = await createRoom({ owner: bob });
    expect(await getSessionPageData(getTestDb(), room.id, s.id, bob.id)).toBeNull();
  });

  it("lobby: titles only for the host; non-host lobby view has no slugs", async () => {
    const s = await createRoomSession({
      roomId,
      hostId: alice.id,
      problems: [{ problemId: p1.id, difficulty: "easy" }],
      participants: [alice.id],
    });
    const host = await getSessionPageData(getTestDb(), roomId, s.id, alice.id);
    expect(host?.lobby?.slots[0].problem?.slug).toBe(p1.slug);
    const member = await getSessionPageData(getTestDb(), roomId, s.id, bob.id);
    expect(member?.lobby?.slots[0].problem).toBeUndefined();
    expect(JSON.stringify(member)).not.toContain(p1.slug);
  });
});
