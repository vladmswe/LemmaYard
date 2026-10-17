// Rooms R2: rooms, invites and membership through the real route handlers and
// the test database (docs/specs/rooms.md §7.2, §8; AC-S-INV-1..3, AC-S-SEC-1,
// AC-S-SEC-4). `next/headers` cookies() is replaced by a per-test cookie jar,
// as in the auth and submissions tests.
import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/server/db";
import { roomMembers, rooms, roomSessions, submissions } from "@/server/db/schema";

const state = vi.hoisted(() => ({
  db: undefined as Db | undefined,
  cookies: new Map<string, string>(),
}));

vi.mock("@/server/db", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/db")>();
  return { ...mod, getDb: () => state.db! };
});

// The jar is copied when cookies() is called (synchronously at the start of a
// request), so parallel requests made right after each other keep their users.
vi.mock("next/headers", () => ({
  cookies: () => {
    const jar = new Map(state.cookies);
    return Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    });
  },
}));

import { GET as getRoomRoute } from "@/app/api/rooms/[roomId]/route";
import { POST as deleteRoute } from "@/app/api/rooms/[roomId]/delete/route";
import { POST as inviteRoute } from "@/app/api/rooms/[roomId]/invite/route";
import { POST as leaveRoute } from "@/app/api/rooms/[roomId]/leave/route";
import { POST as makeOwnerRoute } from "@/app/api/rooms/[roomId]/members/[userId]/make-owner/route";
import { POST as removeRoute } from "@/app/api/rooms/[roomId]/members/[userId]/remove/route";
import { POST as mySettingsRoute } from "@/app/api/rooms/[roomId]/members/me/settings/route";
import { POST as renameRoute } from "@/app/api/rooms/[roomId]/rename/route";
import { POST as settingsRoute } from "@/app/api/rooms/[roomId]/settings/route";
import { POST as joinRoute } from "@/app/api/rooms/join/route";
import { POST as previewRoute } from "@/app/api/rooms/join/preview/route";
import { GET as listRoute, POST as createRoute } from "@/app/api/rooms/route";
import RoomPage from "@/app/(site)/rooms/[roomId]/page";
import { INVITE_TOKEN_PATTERN } from "@/lib/rooms/invite";
import { SESSION_COOKIE } from "@/server/auth/cookie";
import { signSessionToken } from "@/server/auth/token";
import { getEnv } from "@/server/env";
import {
  INVITE_INVALID,
  inviteRotationLimiter,
  joinAddressLimiter,
  joinUserLimiter,
} from "@/server/rooms/membership";

import { closeTestDb, createProblem, createUser, getTestDb, resetTestDb } from "../helpers/db";
import { addRoomMember, createRoom, createRoomSession, createSessionSubmission } from "../helpers/rooms";

const ORIGIN = new URL(getEnv().AUTH_URL).origin;
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";

type User = Awaited<ReturnType<typeof createUser>>;

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

async function signIn(user: User | null) {
  state.cookies.clear();
  if (user) state.cookies.set(SESSION_COOKIE, await signSessionToken(user.id));
}

async function as<T>(user: User | null, fn: () => Promise<T>): Promise<T> {
  await signIn(user);
  return fn();
}

const api = {
  create: (body: unknown, h?: Record<string, string>) => createRoute(post("/api/rooms", body, h)),
  list: () => listRoute(),
  get: (roomId: string) => getRoomRoute(new Request(`${ORIGIN}/api/rooms/${roomId}`), params({ roomId })),
  rename: (roomId: string, body: unknown, h?: Record<string, string>) =>
    renameRoute(post(`/api/rooms/${roomId}/rename`, body, h), params({ roomId })),
  settings: (roomId: string, body: unknown, h?: Record<string, string>) =>
    settingsRoute(post(`/api/rooms/${roomId}/settings`, body, h), params({ roomId })),
  invite: (roomId: string, body: unknown, h?: Record<string, string>) =>
    inviteRoute(post(`/api/rooms/${roomId}/invite`, body, h), params({ roomId })),
  leave: (roomId: string, body: unknown = {}, h?: Record<string, string>) =>
    leaveRoute(post(`/api/rooms/${roomId}/leave`, body, h), params({ roomId })),
  delete: (roomId: string, body: unknown, h?: Record<string, string>) =>
    deleteRoute(post(`/api/rooms/${roomId}/delete`, body, h), params({ roomId })),
  remove: (roomId: string, userId: string, body: unknown = {}, h?: Record<string, string>) =>
    removeRoute(post(`/api/rooms/${roomId}/members/${userId}/remove`, body, h), params({ roomId, userId })),
  makeOwner: (roomId: string, userId: string, body: unknown = {}, h?: Record<string, string>) =>
    makeOwnerRoute(post(`/api/rooms/${roomId}/members/${userId}/make-owner`, body, h), params({ roomId, userId })),
  mySettings: (roomId: string, body: unknown, h?: Record<string, string>) =>
    mySettingsRoute(post(`/api/rooms/${roomId}/members/me/settings`, body, h), params({ roomId })),
  join: (token: unknown, h?: Record<string, string>) => joinRoute(post("/api/rooms/join", { token }, h)),
  preview: (token: unknown, h?: Record<string, string>) => previewRoute(post("/api/rooms/join/preview", { token }, h)),
};

/** Owner rotates an invite and gets the raw token from the URL fragment. */
async function rotate(owner: User, roomId: string, expiresInDays = 7): Promise<string> {
  const res = await as(owner, () => api.invite(roomId, { action: "rotate", expiresInDays }));
  expect(res.status).toBe(200);
  const body = await res.json();
  const url = new URL(body.url);
  expect(url.origin).toBe(ORIGIN);
  expect(url.pathname).toBe("/rooms/join");
  expect(url.search).toBe("");
  return url.hash.slice(1);
}

async function members(roomId: string) {
  return getTestDb()
    .select({ userId: roomMembers.userId, role: roomMembers.role })
    .from(roomMembers)
    .where(eq(roomMembers.roomId, roomId));
}

/** Everything a room route could write, for "rejected requests write nothing". */
async function snapshot() {
  const { rows } = await getTestDb().execute(sql`
    SELECT
      (SELECT coalesce(json_agg(r ORDER BY r.id), '[]') FROM rooms r) AS rooms,
      (SELECT coalesce(json_agg(m ORDER BY m.room_id, m.user_id), '[]') FROM room_members m) AS members
  `);
  return JSON.stringify(rows[0]);
}

let owner: User;
let bob: User;
let carol: User;
let outsider: User;

beforeAll(() => {
  state.db = getTestDb();
});
beforeEach(async () => {
  await resetTestDb();
  inviteRotationLimiter.reset();
  joinUserLimiter.reset();
  joinAddressLimiter.reset();
  owner = await createUser({ username: "alice" });
  bob = await createUser({ username: "bob" });
  carol = await createUser({ username: "carol" });
  outsider = await createUser({ username: "mallory" });
});
afterAll(closeTestDb);

describe("create and list rooms (AC-S-INV-1)", () => {
  it("creates a room whose creator is the only owner; trims the name", async () => {
    const res = await as(owner, () => api.create({ name: "  Saturday Algo Club  " }));
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { id } = await res.json();
    const [room] = await getTestDb().select().from(rooms).where(eq(rooms.id, id));
    expect(room.name).toBe("Saturday Algo Club");
    expect(room.inviteTokenHash).toBeNull();
    expect(await members(id)).toEqual([{ userId: owner.id, role: "owner" }]);

    const list = await (await as(owner, () => api.list())).json();
    expect(list.rooms).toHaveLength(1);
    expect(list.rooms[0]).toMatchObject({ id, name: "Saturday Algo Club", role: "owner", memberCount: 1, memberNames: ["alice"] });
    expect((await (await as(bob, () => api.list())).json()).rooms).toEqual([]);
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["61 characters", "x".repeat(61)],
    ["U+0000", "bad\u0000name"],
    ["a control character", "tab\tname"],
    ["not a string", 42],
  ])("rejects a %s name with 400 and writes nothing", async (_case, name) => {
    const before = await snapshot();
    const res = await as(owner, () => api.create({ name }));
    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors.name).toBeTruthy();
    expect(await snapshot()).toBe(before);
  });

  it("accepts 60 characters counted as code points", async () => {
    const name = "é".repeat(30) + "日".repeat(30);
    expect((await as(owner, () => api.create({ name }))).status).toBe(201);
  });

  it("caps owned rooms at 5 (409) and creations at 5 per hour (429)", async () => {
    for (let i = 0; i < 5; i++) expect((await as(owner, () => api.create({ name: `R${i}` }))).status).toBe(201);
    const sixth = await as(owner, () => api.create({ name: "R6" }));
    expect(sixth.status).toBe(409);
    expect((await sixth.json()).error).toMatch(/at most 5 rooms/);

    // Ownership of two rooms handed over: under the owned cap again, but the
    // hourly creation count (rooms.created_by) still blocks.
    await getTestDb().execute(sql`
      UPDATE room_members SET role = 'member'
      WHERE user_id = ${owner.id} AND room_id IN (SELECT id FROM rooms WHERE name IN ('R0', 'R1'))`);
    const limited = await as(owner, () => api.create({ name: "R7" }));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(3000);
    expect(await getTestDb().$count(rooms)).toBe(5);
  });

  it("caps memberships at 20 (409)", async () => {
    for (let i = 0; i < 20; i++) {
      const { room } = await createRoom();
      await addRoomMember(room.id, carol.id);
    }
    const res = await as(carol, () => api.create({ name: "One too many" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/at most 20 rooms/);
  });

  it("parallel creates cannot exceed the owned cap", async () => {
    await signIn(owner);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => api.create({ name: `P${i}` })));
    expect(results.filter((r) => r.status === 201)).toHaveLength(5);
    expect(await getTestDb().$count(roomMembers, and(eq(roomMembers.userId, owner.id), eq(roomMembers.role, "owner")))).toBe(5);
  });
});

describe("invite links (AC-S-INV-2)", () => {
  it("returns a 43-char token once and stores only its sha256", async () => {
    const { room } = await createRoom({ owner });
    const token = await rotate(owner, room.id);
    expect(token).toMatch(INVITE_TOKEN_PATTERN);
    expect(token).toHaveLength(43);
    const [row] = await getTestDb().select().from(rooms).where(eq(rooms.id, room.id));
    expect(row.inviteTokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(token);

    // Never again: room detail (owner) and list carry no token or hash.
    const detail = await (await as(owner, () => api.get(room.id))).text();
    const list = await (await as(owner, () => api.list())).text();
    for (const text of [detail, list]) {
      expect(text).not.toContain(token);
      expect(text).not.toContain(row.inviteTokenHash!);
    }
    expect(JSON.parse(detail).invite).toEqual({ active: true, expiresAt: row.inviteExpiresAt!.toISOString() });
  });

  it.each([1, 7, 30])("expiresInDays %i sets the expiry from the DB clock", async (days) => {
    const { room } = await createRoom({ owner });
    const before = Date.now();
    const res = await as(owner, () => api.invite(room.id, { action: "rotate", expiresInDays: days }));
    const { expiresAt } = await res.json();
    const delta = new Date(expiresAt).getTime() - before;
    expect(Math.abs(delta - days * 86_400_000)).toBeLessThan(60_000);
  });

  it.each([[3], [0], ["7"], [null]])("rejects expiresInDays %j with 400", async (days) => {
    const { room } = await createRoom({ owner });
    const res = await as(owner, () => api.invite(room.id, { action: "rotate", expiresInDays: days }));
    expect(res.status).toBe(400);
  });

  it("previews and joins with a valid token; join is idempotent", async () => {
    const { room } = await createRoom({ owner, name: "Saturday Algo Club", members: [carol] });
    const token = await rotate(owner, room.id);

    const preview = await as(bob, () => api.preview(token));
    expect(preview.status).toBe(200);
    expect(await preview.json()).toEqual({
      name: "Saturday Algo Club",
      memberCount: 2,
      memberNames: ["alice", "carol"],
      shareSolutions: true,
      alreadyMember: false,
    });

    const first = await as(bob, () => api.join(token));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ roomId: room.id });
    const again = await as(bob, () => api.join(token));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ roomId: room.id });
    expect(await members(room.id)).toHaveLength(3);
    expect((await members(room.id)).find((m) => m.userId === bob.id)?.role).toBe("member");

    const mine = await (await as(bob, () => api.preview(token))).json();
    expect(mine).toMatchObject({ alreadyMember: true, roomId: room.id, memberCount: 3 });
  });

  it("an old token dies on rotation; expired, disabled and malformed tokens get the same 404", async () => {
    const { room } = await createRoom({ owner });
    const old = await rotate(owner, room.id);
    const fresh = await rotate(owner, room.id);
    const bodies: string[] = [];
    const expectInvalid = async (res: Response) => {
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(JSON.parse(text)).toEqual({ error: INVITE_INVALID });
      bodies.push(text);
    };

    await expectInvalid(await as(bob, () => api.join(old)));
    await expectInvalid(await as(bob, () => api.preview(old)));

    // Expired: time moved through the DB.
    await getTestDb().execute(sql`UPDATE rooms SET invite_expires_at = now() - interval '1 second' WHERE id = ${room.id}`);
    await expectInvalid(await as(bob, () => api.join(fresh)));
    expect((await (await as(owner, () => api.get(room.id))).json()).invite).toEqual({ active: false, expiresAt: null });

    const third = await rotate(owner, room.id);
    expect((await as(owner, () => api.invite(room.id, { action: "disable" }))).status).toBe(200);
    const [row] = await getTestDb().select().from(rooms).where(eq(rooms.id, room.id));
    expect(row.inviteTokenHash).toBeNull();
    expect(row.inviteExpiresAt).toBeNull();
    await expectInvalid(await as(bob, () => api.join(third)));

    for (const bad of ["short", "x".repeat(43).replace(/x/g, "*"), "", "A".repeat(43)]) {
      await expectInvalid(await as(bob, () => api.join(bad)));
    }
    expect(new Set(bodies).size).toBe(1);
    expect(await members(room.id)).toHaveLength(1);
  });

  it("rejects a token that is not a string or too long with 400, and extra keys", async () => {
    await signIn(bob);
    expect((await api.join(12345)).status).toBe(400);
    expect((await api.join("a".repeat(200))).status).toBe(400);
    expect((await joinRoute(post("/api/rooms/join", { token: "a".repeat(43), extra: 1 }))).status).toBe(400);
  });

  it("the 21st member gets 409", async () => {
    const { room } = await createRoom({ owner });
    for (let i = 0; i < 19; i++) await addRoomMember(room.id, (await createUser()).id);
    const token = await rotate(owner, room.id);
    const res = await as(bob, () => api.join(token));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/full/);
    expect(await members(room.id)).toHaveLength(20);
  });

  it("parallel joins never exceed 20 members", async () => {
    const { room } = await createRoom({ owner });
    for (let i = 0; i < 15; i++) await addRoomMember(room.id, (await createUser()).id);
    const token = await rotate(owner, room.id);
    const joiners = await Promise.all(Array.from({ length: 10 }, () => createUser()));
    const tokens = await Promise.all(joiners.map((u) => signSessionToken(u.id)));
    // Each request reads the jar when it starts, so set the cookie right before each call.
    const pending = tokens.map((cookie) => {
      state.cookies.set(SESSION_COOKIE, cookie);
      return joinRoute(post("/api/rooms/join", { token }));
    });
    const statuses = (await Promise.all(pending)).map((r) => r.status);
    expect(await members(room.id)).toHaveLength(20);
    expect(statuses.filter((s) => s === 200)).toHaveLength(4);
    expect(statuses.filter((s) => s === 409)).toHaveLength(6);
  });

  it("the same user joining twice in parallel gets one membership", async () => {
    const { room } = await createRoom({ owner });
    const token = await rotate(owner, room.id);
    await signIn(bob);
    const results = await Promise.all([api.join(token), api.join(token), api.join(token)]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await members(room.id)).toHaveLength(2);
  });

  it("rotate racing a join: once the rotation commits, the old token adds nobody", async () => {
    for (let i = 0; i < 8; i++) {
      await resetTestDb();
      inviteRotationLimiter.reset();
      const o = await createUser();
      const joiner = await createUser();
      const { room } = await createRoom({ owner: o });
      const old = await rotate(o, room.id);
      const [ownerCookie, joinerCookie] = await Promise.all([signSessionToken(o.id), signSessionToken(joiner.id)]);
      state.cookies.set(SESSION_COOKIE, joinerCookie);
      const joinReq = joinRoute(post("/api/rooms/join", { token: old }));
      state.cookies.set(SESSION_COOKIE, ownerCookie);
      const rotateReq = inviteRoute(
        post(`/api/rooms/${room.id}/invite`, { action: "rotate", expiresInDays: 7 }),
        params({ roomId: room.id }),
      );
      const [joinRes, rotateRes] = await Promise.all([joinReq, rotateReq]);
      expect(rotateRes.status).toBe(200);
      const joined = (await members(room.id)).some((m) => m.userId === joiner.id);
      expect(joinRes.status === 200).toBe(joined);
      expect([200, 404]).toContain(joinRes.status);
      // After the rotation committed, the old token is dead for everyone.
      const late = await createUser();
      expect((await as(late, () => api.join(old))).status).toBe(404);
    }
  });

  it("rate-limits failed attempts per user (20/h) before any lookup", async () => {
    const { room } = await createRoom({ owner });
    const token = await rotate(owner, room.id);
    await signIn(bob);
    for (let i = 0; i < 20; i++) expect((await api.join("A".repeat(43))).status).toBe(404);
    const blocked = await api.join(token);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await api.preview(token)).status).toBe(429);
    expect(await members(room.id)).toHaveLength(1);
    // Successful attempts do not count; another user is unaffected.
    expect((await as(carol, () => api.join(token))).status).toBe(200);
  });

  it("rate-limits failed attempts per client address across accounts", async () => {
    const headers = { "x-forwarded-for": "203.0.113.7" };
    for (let i = 0; i < 60; i++) {
      const u = await createUser();
      expect((await as(u, () => api.join("B".repeat(43), headers))).status).toBe(404);
    }
    expect((await as(bob, () => api.join("C".repeat(43), headers))).status).toBe(429);
    expect((await as(bob, () => api.join("C".repeat(43), { "x-forwarded-for": "198.51.100.1" }))).status).toBe(404);
  });

  it("limits rotations to 20 per room per day", async () => {
    const { room } = await createRoom({ owner });
    for (let i = 0; i < 20; i++) await rotate(owner, room.id);
    const res = await as(owner, () => api.invite(room.id, { action: "rotate", expiresInDays: 7 }));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    // Turning the link off is never limited.
    expect((await as(owner, () => api.invite(room.id, { action: "disable" }))).status).toBe(200);
  });
});

describe("roles, leaving and removal (AC-S-INV-3)", () => {
  it("owner cannot leave while others are members; members can", async () => {
    const { room } = await createRoom({ owner, members: [bob] });
    const res = await as(owner, () => api.leave(room.id));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("Transfer ownership first");
    expect(await members(room.id)).toHaveLength(2);

    expect((await as(bob, () => api.leave(room.id))).status).toBe(200);
    expect(await members(room.id)).toEqual([{ userId: owner.id, role: "owner" }]);
    expect((await as(bob, () => api.get(room.id))).status).toBe(404);
  });

  it("the last member leaving deletes the room", async () => {
    const { room } = await createRoom({ owner });
    const res = await as(owner, () => api.leave(room.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(await getTestDb().$count(rooms)).toBe(0);
  });

  it("a removed member loses access at once", async () => {
    const { room } = await createRoom({ owner, members: [bob, carol] });
    expect((await as(bob, () => api.get(room.id))).status).toBe(200);
    expect((await as(owner, () => api.remove(room.id, bob.id))).status).toBe(200);
    expect((await as(bob, () => api.get(room.id))).status).toBe(404);
    expect((await as(bob, () => api.mySettings(room.id, { shareSolutions: false }))).status).toBe(404);
    expect((await as(bob, () => api.leave(room.id))).status).toBe(404);
    expect(await members(room.id)).toHaveLength(2);
  });

  it("remove: not oneself (400), unknown or malformed member (404), members cannot (403)", async () => {
    const { room } = await createRoom({ owner, members: [bob] });
    expect((await as(owner, () => api.remove(room.id, owner.id))).status).toBe(400);
    expect((await as(owner, () => api.remove(room.id, outsider.id))).status).toBe(404);
    expect((await as(owner, () => api.remove(room.id, "not-a-uuid"))).status).toBe(404);
    const denied = await as(bob, () => api.remove(room.id, owner.id));
    expect(denied.status).toBe(403);
    expect((await denied.json()).error).toBe("Only the room owner can do this");
    expect(await members(room.id)).toHaveLength(2);
  });

  it("make-owner swaps the roles atomically", async () => {
    const { room } = await createRoom({ owner, members: [bob, carol] });
    expect((await as(owner, () => api.makeOwner(room.id, bob.id))).status).toBe(200);
    const roles = Object.fromEntries((await members(room.id)).map((m) => [m.userId, m.role]));
    expect(roles).toEqual({ [owner.id]: "member", [bob.id]: "owner", [carol.id]: "member" });
    // The former owner is now a member: owner actions are 403; they may leave.
    expect((await as(owner, () => api.rename(room.id, { name: "Mine" }))).status).toBe(403);
    expect((await as(owner, () => api.leave(room.id))).status).toBe(200);
    expect((await as(owner, () => api.makeOwner(room.id, owner.id))).status).toBe(404);
  });

  it("parallel transfers leave exactly one owner", async () => {
    const { room } = await createRoom({ owner, members: [bob, carol] });
    await signIn(owner);
    const results = await Promise.all([api.makeOwner(room.id, bob.id), api.makeOwner(room.id, carol.id)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 403]);
    const owners = (await members(room.id)).filter((m) => m.role === "owner");
    expect(owners).toHaveLength(1);
  });

  it("make-owner: self 400, non-member 404", async () => {
    const { room } = await createRoom({ owner, members: [bob] });
    expect((await as(owner, () => api.makeOwner(room.id, owner.id))).status).toBe(400);
    expect((await as(owner, () => api.makeOwner(room.id, outsider.id))).status).toBe(404);
  });

  it("an ownerless room promotes its earliest member on the next read", async () => {
    const { room } = await createRoom({ owner, members: [bob, carol] });
    await getTestDb().execute(sql`UPDATE room_members SET joined_at = now() - interval '1 day' WHERE user_id = ${bob.id}`);
    await getTestDb().delete(roomMembers).where(eq(roomMembers.userId, owner.id));
    const detail = await (await as(carol, () => api.get(room.id))).json();
    expect(detail.members[0]).toMatchObject({ username: "bob", role: "owner" });
  });
});

describe("owner settings, member opt-out, delete", () => {
  it("rename and room sharing are owner-only; members can set their own opt-out", async () => {
    const { room } = await createRoom({ owner, members: [bob] });
    expect((await as(owner, () => api.rename(room.id, { name: " New name " }))).status).toBe(200);
    expect((await as(owner, () => api.settings(room.id, { shareSolutions: false }))).status).toBe(200);
    expect((await as(bob, () => api.rename(room.id, { name: "Hijack" }))).status).toBe(403);
    expect((await as(bob, () => api.settings(room.id, { shareSolutions: true }))).status).toBe(403);
    expect((await as(bob, () => api.invite(room.id, { action: "disable" }))).status).toBe(403);
    expect((await as(bob, () => api.delete(room.id, { confirmName: "New name" }))).status).toBe(403);
    expect((await as(bob, () => api.mySettings(room.id, { shareSolutions: false }))).status).toBe(200);

    const [row] = await getTestDb().select().from(rooms).where(eq(rooms.id, room.id));
    expect(row).toMatchObject({ name: "New name", shareSolutions: false });
    const bobDetail = await (await as(bob, () => api.get(room.id))).json();
    expect(bobDetail.viewer).toMatchObject({ role: "member", shareSolutions: false });
    expect(bobDetail.invite).toBeNull();
  });

  it("delete needs the exact name and cascades sessions; submissions keep their rows", async () => {
    const { room } = await createRoom({ owner, name: "Club", members: [bob] });
    const problem = await createProblem();
    const session = await createRoomSession({
      roomId: room.id,
      hostId: owner.id,
      status: "finished",
      problems: [{ problemId: problem.id, difficulty: problem.difficulty }],
      participants: [owner.id, bob.id],
    });
    const sub = await createSessionSubmission({
      userId: bob.id,
      problemId: problem.id,
      roomSessionId: session.id,
      status: "accepted",
      createdAt: new Date(session.startedAt!.getTime() + 60_000),
    });

    const wrong = await as(owner, () => api.delete(room.id, { confirmName: "club" }));
    expect(wrong.status).toBe(400);
    expect(await getTestDb().$count(rooms)).toBe(1);

    expect((await as(owner, () => api.delete(room.id, { confirmName: " Club " }))).status).toBe(200);
    expect(await getTestDb().$count(rooms)).toBe(0);
    expect(await getTestDb().$count(roomMembers)).toBe(0);
    expect(await getTestDb().$count(roomSessions)).toBe(0);
    const [kept] = await getTestDb().select().from(submissions).where(eq(submissions.id, sub.id));
    expect(kept.roomSessionId).toBeNull();
    expect((await as(bob, () => api.get(room.id))).status).toBe(404);
  });
});

// --- AC-S-SEC-1 / AC-S-SEC-4: the membership matrix and negative cases ------

type RouteCase = {
  name: string;
  call: (roomId: string, h?: Record<string, string>, body?: unknown) => Promise<Response>;
  body: unknown;
  ownerOnly: boolean;
};

const ROOM_ROUTES: RouteCase[] = [
  { name: "rename", call: (r, h, b) => api.rename(r, b, h), body: { name: "X" }, ownerOnly: true },
  { name: "settings", call: (r, h, b) => api.settings(r, b, h), body: { shareSolutions: false }, ownerOnly: true },
  { name: "invite rotate", call: (r, h, b) => api.invite(r, b, h), body: { action: "rotate", expiresInDays: 7 }, ownerOnly: true },
  { name: "invite disable", call: (r, h, b) => api.invite(r, b, h), body: { action: "disable" }, ownerOnly: true },
  { name: "leave", call: (r, h, b) => api.leave(r, b, h), body: {}, ownerOnly: false },
  { name: "delete", call: (r, h, b) => api.delete(r, b, h), body: { confirmName: "Target" }, ownerOnly: true },
  { name: "remove", call: (r, h, b) => api.remove(r, UNKNOWN_ID, b, h), body: {}, ownerOnly: true },
  { name: "make-owner", call: (r, h, b) => api.makeOwner(r, UNKNOWN_ID, b, h), body: {}, ownerOnly: true },
  { name: "my settings", call: (r, h, b) => api.mySettings(r, b, h), body: { shareSolutions: false }, ownerOnly: false },
];

describe("non-members get the unknown-id 404 on every room route (AC-S-SEC-1)", () => {
  async function shape(res: Response) {
    return { status: res.status, body: await res.text(), cache: res.headers.get("cache-control") };
  }

  it("GET room", async () => {
    const { room } = await createRoom({ owner, name: "Target" });
    await signIn(outsider);
    const real = await shape(await api.get(room.id));
    expect(real.status).toBe(404);
    expect(real).toEqual(await shape(await api.get(UNKNOWN_ID)));
    expect(real).toEqual(await shape(await api.get("not-a-uuid")));
    expect(real.body).not.toContain("Target");
  });

  it.each(ROOM_ROUTES)("$name", async ({ call, body }) => {
    const { room } = await createRoom({ owner, name: "Target", members: [bob] });
    await rotate(owner, room.id);
    const before = await snapshot();
    await signIn(outsider);
    const real = await shape(await call(room.id, undefined, body));
    expect(real.status).toBe(404);
    expect(real).toEqual(await shape(await call(UNKNOWN_ID, undefined, body)));
    expect(real).toEqual(await shape(await call("not-a-uuid", undefined, body)));
    expect(await snapshot()).toBe(before);
  });

  it("a member of room A cannot reach room B through A", async () => {
    const { room: a } = await createRoom({ owner: bob });
    const { room: b } = await createRoom({ owner, members: [carol] });
    await signIn(bob);
    expect((await api.get(b.id)).status).toBe(404);
    // Member ids of room B used on room A: not members there → 404.
    expect((await api.remove(a.id, carol.id)).status).toBe(404);
    expect((await api.makeOwner(a.id, carol.id)).status).toBe(404);
    expect(await members(b.id)).toHaveLength(2);
  });

  it("the room page itself is a 404 for non-members and unknown ids", async () => {
    const { room } = await createRoom({ owner });
    const props = (roomId: string) => ({ params: Promise.resolve({ roomId }), searchParams: Promise.resolve({}) });
    const fallback = async (p: Promise<unknown>) => {
      try {
        await p;
        return null;
      } catch (e) {
        return (e as { digest?: string }).digest ?? String(e);
      }
    };
    await signIn(outsider);
    expect(await fallback(RoomPage(props(room.id)))).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(await fallback(RoomPage(props(UNKNOWN_ID)))).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(await fallback(RoomPage(props("nope")))).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
    await signIn(null);
    expect(await fallback(RoomPage(props(room.id)))).toMatch(/^NEXT_REDIRECT;\w+;\/login\?next=%2Frooms%2F/);
    await signIn(owner);
    expect(await fallback(RoomPage(props(room.id)))).toBeNull();
  });
});

describe("negative cases write nothing (AC-S-SEC-4)", () => {
  async function cases() {
    const { room } = await createRoom({ owner, name: "Target", members: [bob] });
    const token = await rotate(owner, room.id);
    return [
      { name: "create", call: (h?: Record<string, string>, b?: unknown) => api.create(b, h), body: { name: "New" } },
      { name: "join", call: (h?: Record<string, string>, b?: unknown) => joinRoute(post("/api/rooms/join", b, h)), body: { token } },
      { name: "preview", call: (h?: Record<string, string>, b?: unknown) => previewRoute(post("/api/rooms/join/preview", b, h)), body: { token } },
      ...ROOM_ROUTES.map((r) => ({
        name: r.name,
        call: (h?: Record<string, string>, b?: unknown) => r.call(room.id, h, b),
        body: r.body,
      })),
    ];
  }

  it("403 wrong Content-Type, 403 foreign Origin, 401 guest, 400 extra keys / bad JSON, 413 > 4 KB", async () => {
    for (const c of await cases()) {
      const before = await snapshot();
      const check = async (status: number, res: Promise<Response>) => {
        const r = await res;
        expect({ route: c.name, status: r.status }).toEqual({ route: c.name, status });
        expect(r.headers.get("cache-control")).toBe("no-store");
      };
      await signIn(owner);
      await check(403, c.call({ "Content-Type": "text/plain" }, c.body));
      await check(403, c.call({ "Content-Type": "application/x-www-form-urlencoded" }, c.body));
      await check(403, c.call({ Origin: "http://evil.example" }, c.body));
      await signIn(null);
      await check(401, c.call(undefined, c.body));
      await signIn(owner);
      await check(400, c.call(undefined, { ...(c.body as object), extra: true }));
      await check(400, c.call(undefined, "{not json"));
      await check(413, c.call(undefined, JSON.stringify({ pad: "x".repeat(5000) })));
      expect(await snapshot()).toBe(before);
    }
  });

  it("out-of-range values and wrong types are 400", async () => {
    const { room } = await createRoom({ owner, members: [bob] });
    await signIn(owner);
    const before = await snapshot();
    for (const res of [
      api.settings(room.id, { shareSolutions: "yes" }),
      api.mySettings(room.id, {}),
      api.invite(room.id, { action: "rotate", expiresInDays: 365 }),
      api.invite(room.id, { action: "explode" }),
      api.rename(room.id, { name: "y".repeat(61) }),
      api.delete(room.id, { confirmName: 5 }),
      api.leave(room.id, { reason: "x" }),
    ]) {
      expect((await res).status).toBe(400);
    }
    expect(await snapshot()).toBe(before);
  });
});
