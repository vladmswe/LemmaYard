// Rooms v2 module V2-2 through the real route handlers and the test database
// (docs/specs/rooms-v2.md §2.5, §5, §11, §14; AC-V2-DEF-2..4):
// GET /api/rooms/:roomId/schedule.ics (members only, uniform 404, headers,
// RFC 5545 content without tokens or names), the rooms list v2 fields
// (profile, Next / Last / You, sort) and the non-host lobby hiding targets.
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/server/db";

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

import { GET as icsRoute } from "@/app/api/rooms/[roomId]/schedule.ics/route";
import { GET as lobbyRoute } from "@/app/api/rooms/[roomId]/sessions/[sessionId]/lobby/route";
import { GET as roomsGet } from "@/app/api/rooms/route";
import { nextOccurrence } from "@/lib/rooms/schedule";
import type { LobbyView } from "@/lib/rooms/session-view";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { signSessionToken } from "@/server/auth/token";
import { getEnv } from "@/server/env";
import type { RoomListItemV2 } from "@/server/rooms/room-list";

import { closeTestDb, createProblem, createUser, getTestDb, resetTestDb } from "../helpers/db";
import { parseIcs, prop } from "../helpers/ics";
import { addRoomMember, addSessionParticipant, createRoom, createRoomSession, createSessionResult } from "../helpers/rooms";

const ORIGIN = new URL(getEnv().AUTH_URL).origin;
type User = Awaited<ReturnType<typeof createUser>>;

const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const get = (path: string) => new Request(`${ORIGIN}${path}`);

async function as<T>(user: User | null, fn: () => Promise<T>): Promise<T> {
  state.cookies.clear();
  if (user) state.cookies.set(SESSION_COOKIE, await signSessionToken(user.id));
  return fn();
}
const ics = (roomId: string) => icsRoute(get(`/api/rooms/${roomId}/schedule.ics`), params({ roomId }));

const SATURDAY = { weekday: 6, time: "18:00", timeZone: "Europe/Kyiv", presetId: null };
const PRESETS = [
  { id: "sat12345", name: "Saturday", problemCount: 4, durationMin: 90, mode: "rating", challenge: "balanced", tags: [], avoidSolved: true, rated: true },
  { id: "short123", name: "Short", problemCount: 2, durationMin: 45, mode: "rating", challenge: "relaxed", tags: [], avoidSolved: true, rated: true },
] as const;

beforeAll(() => {
  state.db = getTestDb();
});
beforeEach(async () => {
  await resetTestDb();
});
afterAll(closeTestDb);

describe("GET /api/rooms/:roomId/schedule.ics", () => {
  it("a member downloads a valid calendar: text/calendar, attachment, weekly RRULE, the preset's duration", async () => {
    const member = await createUser();
    const { room, owner } = await createRoom({
      name: "Saturday Algo Club",
      schedule: { ...SATURDAY, presetId: "short123" },
      presets: [...PRESETS],
      defaultPresetId: "sat12345",
      members: [member],
    });
    for (const u of [owner, member]) {
      const res = await as(u, () => ics(room.id));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/calendar; charset=utf-8");
      expect(res.headers.get("content-disposition")).toBe('attachment; filename="saturday-algo-club.ics"');
      expect(res.headers.get("cache-control")).toContain("no-store");
      const text = await res.text();
      const cal = parseIcs(text);
      const event = cal.children.find((c) => c.name === "VEVENT")!;
      expect(prop(event, "RRULE")!.value).toBe("FREQ=WEEKLY;BYDAY=SA");
      expect(prop(event, "DTSTART")!.params.TZID).toBe("Europe/Kyiv");
      expect(prop(event, "DTSTART")!.value).toMatch(/^\d{8}T180000$/);
      expect(prop(event, "DURATION")!.value).toBe("PT45M"); // the schedule's preset "Short"
      expect(prop(event, "SUMMARY")!.value).toBe("Saturday Algo Club");
      expect(prop(event, "UID")!.value).toBe(`room-${room.id}-weekly@${new URL(ORIGIN).hostname}`);
      expect(prop(event, "URL")!.value).toBe(`${getEnv().AUTH_URL.replace(/\/+$/, "")}/rooms/${room.id}`);
      // §14: no token, no member names.
      expect(text).not.toContain(owner.username);
      expect(text).not.toContain(member.username);
      expect(text).not.toMatch(/invite|token/i);
    }
  });

  it("starts at the next occurrence, skipping one a finished session already used", async () => {
    const { room, owner } = await createRoom({ schedule: SATURDAY, presets: [...PRESETS] });
    const next = nextOccurrence(SATURDAY, new Date());
    await createRoomSession({ roomId: room.id, status: "finished", plannedFor: next, startedAt: new Date(Date.now() - 3 * 3600_000) });
    const after = nextOccurrence(SATURDAY, new Date(), [next]);
    const event = parseIcs(await (await as(owner, () => ics(room.id))).text()).children.find((c) => c.name === "VEVENT")!;
    const local = new Date(after.getTime() + 3 * 3600_000); // only the date part is compared
    expect(prop(event, "DTSTART")!.value.slice(0, 8)).toBe(
      `${local.getUTCFullYear()}${String(local.getUTCMonth() + 1).padStart(2, "0")}${String(local.getUTCDate()).padStart(2, "0")}`,
    );
    expect(after.getTime() - next.getTime()).toBeGreaterThanOrEqual(6 * 86_400_000);
  });

  it("uniform 404 for non-members, unknown and malformed ids, and rooms without a schedule; 401 signed out", async () => {
    const stranger = await createUser();
    const { room, owner } = await createRoom({ schedule: SATURDAY });
    const { room: plain } = await createRoom({ owner });
    const bodies: unknown[] = [];
    for (const [u, id] of [
      [stranger, room.id],
      [owner, "00000000-0000-4000-8000-000000000000"],
      [owner, "not-a-uuid"],
      [owner, plain.id],
    ] as const) {
      const res = await as(u, () => ics(id));
      expect(res.status).toBe(404);
      bodies.push(await res.json());
    }
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    expect(bodies[0]).toEqual({ error: "Room not found" });
    expect((await as(null, () => ics(room.id))).status).toBe(401);
  });
});

describe("GET /api/rooms v2 fields", () => {
  it("profile, Next (schedule), Last (own chips), You (attendance, rating) and sort", async () => {
    const me = await createUser();
    const friend = await createUser();
    const problem = await createProblem();
    const problem2 = await createProblem();
    const { room: scheduled } = await createRoom({
      name: "Scheduled",
      description: "Weekly practice",
      color: 3,
      schedule: SATURDAY,
      presets: [...PRESETS],
      defaultPresetId: "sat12345",
      members: [me, friend],
    });
    await getTestDb().execute(
      sql`UPDATE room_members SET rating = 1540, rated_pairs = 3, rating_source = 'default'
        WHERE room_id = ${scheduled.id} AND user_id = ${me.id}`,
    );
    const s1 = await createRoomSession({
      roomId: scheduled.id,
      status: "finished",
      startedAt: new Date(Date.now() - 48 * 3600_000),
      problems: [
        { problemId: problem.id, difficulty: "easy" },
        { problemId: problem2.id, difficulty: "easy" },
      ],
      participants: [me.id, friend.id],
    });
    await createSessionResult({ sessionId: s1.id, userId: me.id, position: 1, attempts: 1, solveSeconds: 600, firstAcceptedAt: new Date() });
    await createSessionResult({ sessionId: s1.id, userId: me.id, position: 2, attempts: 2 });
    const s0 = await createRoomSession({ roomId: scheduled.id, status: "finished", startedAt: new Date(Date.now() - 9 * 86_400_000) });
    await addSessionParticipant(s0.id, friend.id);

    const { room: quiet } = await createRoom({ name: "Quiet", owner: me });
    const { room: live } = await createRoom({ name: "Live", members: [me] });
    await createRoomSession({ roomId: live.id, status: "live", startedAt: new Date(Date.now() - 5 * 60_000), durationMin: 30 });
    void quiet;

    const res = await as(me, () => roomsGet());
    expect(res.status).toBe(200);
    const { rooms } = (await res.json()) as { rooms: RoomListItemV2[] };
    expect(rooms.map((r) => r.name)).toEqual(["Live", "Scheduled", "Quiet"]);
    const sched = rooms[1];
    expect(sched).toMatchObject({ description: "Weekly practice", color: 3, role: "member" });
    expect(sched.next).toEqual({ at: nextOccurrence(SATURDAY, new Date()).toISOString(), timeZone: "Europe/Kyiv", presetName: "Saturday" });
    expect(sched.last).toMatchObject({ problemCount: 2, chips: [{ position: 1, state: "solved" }, { position: 2, state: "tried" }] });
    expect(sched.you).toEqual({ attendance: "played 1 of 1 since joining", rating: 1540, provisional: true });
    expect(rooms[2]).toMatchObject({ name: "Quiet", next: null, last: null, you: { attendance: null, rating: null } });

    // The friend did not play the latest session's results: chips only for participants.
    const theirs = (await (await as(friend, () => roomsGet())).json()) as { rooms: RoomListItemV2[] };
    expect(theirs.rooms[0].last!.chips).toEqual([
      { position: 1, state: "none" },
      { position: 2, state: "none" },
    ]);
    const stranger = await createUser();
    const none = (await (await as(stranger, () => roomsGet())).json()) as { rooms: RoomListItemV2[] };
    expect(none.rooms).toEqual([]);
  });
});

describe("non-host lobby view", () => {
  it("carries the chance but no titles, ratings or slot targets (AC-V2-SEL-4)", async () => {
    const member = await createUser();
    const p = await createProblem();
    const { room, owner } = await createRoom({ members: [member] });
    const session = await createRoomSession({
      roomId: room.id,
      hostId: owner.id,
      problems: [{ problemId: p.id, difficulty: "easy" }],
      settings: {
        tags: [],
        mixMode: "suggested",
        mix: { easy: 1, medium: 0, hard: 0 },
        challenge: "balanced",
        avoidSolved: true,
        mode: "rating",
        targets: [1300],
      },
    });
    await addRoomMember(room.id, (await createUser()).id);
    const view = async (u: User) =>
      ((await (await as(u, () => lobbyRoute(get("/"), params({ roomId: room.id, sessionId: session.id })))).json()) as { lobby: LobbyView })
        .lobby;
    const host = await view(owner);
    expect(host.settings.targets).toEqual([1300]);
    const other = await view(member);
    expect(other.settings.targets).toBeUndefined();
    expect(JSON.stringify(other)).not.toContain(p.slug);
    expect(other.slots[0].rating).toEqual({ chance: expect.any(Number) });
  });
});
