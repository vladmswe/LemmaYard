// Invite helpers, session state machine and event/cursor contract.
import { describe, expect, it } from "vitest";

import {
  decodeCursor,
  encodeCursor,
  maxCursor,
  ROOM_EVENT_TYPES,
  roomEventPayloadSchemas,
  sessionLockKey,
  toRoomEvent,
  validateNewRoomEvent,
} from "@/lib/rooms/events";
import {
  generateInviteToken,
  hashInviteToken,
  INVITE_HASH_PATTERN,
  inviteExpiresAt,
  inviteUrl,
  isInviteActive,
  isInviteTokenFormat,
  tokenFromHash,
} from "@/lib/rooms/invite";
import {
  canManageSession,
  canTransition,
  computeEndsAt,
  dueAction,
  effectiveStatus,
  isOpenStatus,
  transition,
  type SessionAction,
} from "@/lib/rooms/session-state";
import { ROOM_ROLES, ROOM_SESSION_STATUSES, roomSessionSettingsSchema } from "@/lib/rooms/types";
import { roomEventTypeEnum, roomRoleEnum, roomSessionStatusEnum } from "@/server/db/schema";

describe("invite tokens", () => {
  it("are 43-char base64url strings from 32 random bytes, all distinct", () => {
    const tokens = Array.from({ length: 200 }, generateInviteToken);
    for (const t of tokens) {
      expect(t).toHaveLength(43);
      expect(isInviteTokenFormat(t)).toBe(true);
    }
    expect(new Set(tokens).size).toBe(200);
  });

  it("rejects malformed tokens", () => {
    for (const bad of ["", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}=`, `${"a".repeat(42)}+`, 42, null]) {
      expect(isInviteTokenFormat(bad)).toBe(false);
    }
  });

  it("hashes with sha256 to 64 lowercase hex chars (known vector)", async () => {
    expect(await hashInviteToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    const h = await hashInviteToken(generateInviteToken());
    expect(h).toMatch(INVITE_HASH_PATTERN);
  });

  it("lives in the URL fragment", () => {
    const t = generateInviteToken();
    expect(inviteUrl("https://lemmayard.example/some/path?x=1", t)).toBe(`https://lemmayard.example/rooms/join#${t}`);
    expect(tokenFromHash(`#${t}`)).toBe(t);
    expect(tokenFromHash("#short")).toBeNull();
  });

  it("expires after 1/7/30 days and can be turned off", () => {
    const now = new Date("2026-10-17T12:00:00Z");
    const expires = inviteExpiresAt(now);
    expect(expires.toISOString()).toBe("2026-10-24T12:00:00.000Z");
    expect(inviteExpiresAt(now, 1).toISOString()).toBe("2026-10-18T12:00:00.000Z");
    expect(isInviteActive({ inviteTokenHash: "h", inviteExpiresAt: expires }, now)).toBe(true);
    expect(isInviteActive({ inviteTokenHash: "h", inviteExpiresAt: expires }, expires)).toBe(false);
    expect(isInviteActive({ inviteTokenHash: null, inviteExpiresAt: null }, now)).toBe(false);
  });
});

describe("session state machine", () => {
  const ACTIONS: SessionAction[] = ["start", "cancel", "stale", "end", "expire"];
  const allowed = new Set(["lobby:start", "lobby:cancel", "lobby:stale", "live:end", "live:expire"]);

  it.each(ROOM_SESSION_STATUSES.flatMap((s) => ACTIONS.map((a) => [s, a] as const)))("%s + %s", (status, action) => {
    expect(canTransition(status, action)).toBe(allowed.has(`${status}:${action}`));
  });

  it("maps actions to the next state and end reason", () => {
    expect(transition("lobby", "start")).toEqual({ ok: true, changed: true, next: "live", endReason: null });
    expect(transition("lobby", "cancel")).toEqual({ ok: true, changed: true, next: "cancelled", endReason: "cancelled" });
    expect(transition("lobby", "stale")).toEqual({ ok: true, changed: true, next: "cancelled", endReason: "stale" });
    expect(transition("live", "end")).toEqual({ ok: true, changed: true, next: "finished", endReason: "host" });
    expect(transition("live", "expire")).toEqual({ ok: true, changed: true, next: "finished", endReason: "time" });
  });

  it("end on finished is an idempotent no-op; cancel on live asks to end instead", () => {
    expect(transition("finished", "end")).toEqual({ ok: true, changed: false, next: "finished" });
    expect(transition("finished", "expire")).toEqual({ ok: true, changed: false, next: "finished" });
    expect(transition("live", "cancel")).toEqual({ ok: false, code: "end_instead" });
    expect(transition("cancelled", "start")).toEqual({ ok: false, code: "invalid_state" });
    expect(transition("lobby", "end")).toEqual({ ok: false, code: "invalid_state" });
  });

  it("lazy close: expire at ends_at, stale lobby after 7 days", () => {
    const created = new Date("2026-10-01T00:00:00Z");
    const started = new Date("2026-10-24T18:00:00Z");
    const endsAt = computeEndsAt(started, 90);
    expect(endsAt.toISOString()).toBe("2026-10-24T19:30:00.000Z");
    const live = { status: "live" as const, createdAt: created, endsAt };
    expect(dueAction(live, new Date("2026-10-24T19:29:59.999Z"))).toBeNull();
    expect(dueAction(live, endsAt)).toBe("expire");
    expect(effectiveStatus(live, endsAt)).toBe("finished");
    const lobby = { status: "lobby" as const, createdAt: created, endsAt: null };
    expect(dueAction(lobby, new Date("2026-10-07T23:59:59Z"))).toBeNull();
    expect(dueAction(lobby, new Date("2026-10-08T00:00:00Z"))).toBe("stale");
    expect(effectiveStatus(lobby, new Date("2026-10-09T00:00:00Z"))).toBe("cancelled");
    expect(isOpenStatus("lobby") && isOpenStatus("live") && !isOpenStatus("finished")).toBe(true);
  });

  it("host or owner may manage a session", () => {
    expect(canManageSession({ userId: "h", role: "member" }, { hostId: "h" })).toBe(true);
    expect(canManageSession({ userId: "o", role: "owner" }, { hostId: "h" })).toBe(true);
    expect(canManageSession({ userId: "m", role: "member" }, { hostId: "h" })).toBe(false);
    expect(canManageSession({ userId: "m", role: "member" }, { hostId: null })).toBe(false);
  });
});

describe("DB enums follow the domain tuples", () => {
  it("room_role, room_session_status, room_event_type", () => {
    expect(roomRoleEnum.enumValues).toEqual([...ROOM_ROLES]);
    expect(roomSessionStatusEnum.enumValues).toEqual([...ROOM_SESSION_STATUSES]);
    expect(roomEventTypeEnum.enumValues).toEqual([...ROOM_EVENT_TYPES]);
    expect(Object.keys(roomEventPayloadSchemas).sort()).toEqual([...ROOM_EVENT_TYPES].sort());
  });

  it("session settings schema is strict", () => {
    const ok = { tags: [], mixMode: "suggested", mix: { easy: 1, medium: 2, hard: 1 }, challenge: "balanced", avoidSolved: true };
    expect(roomSessionSettingsSchema.safeParse(ok).success).toBe(true);
    expect(roomSessionSettingsSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
    expect(roomSessionSettingsSchema.safeParse({ ...ok, tags: ["a", "b", "c", "d", "e", "f"] }).success).toBe(false);
  });
});

describe("events", () => {
  it("validates payloads and actor presence before insert", () => {
    expect(
      validateNewRoomEvent({
        type: "problem_solved",
        actorUserId: "u",
        payload: { position: 2, solveSeconds: 1470, wrongBefore: 1, firstSolver: true, solvedCount: 2 },
      }),
    ).toEqual({ position: 2, solveSeconds: 1470, wrongBefore: 1, firstSolver: true, solvedCount: 2 });
    expect(() => validateNewRoomEvent({ type: "problem_solved", payload: { position: 2, solveSeconds: 1, wrongBefore: 0, firstSolver: true, solvedCount: 1 } })).toThrow(/actor required/);
    expect(() => validateNewRoomEvent({ type: "session_cancelled", actorUserId: "u", payload: {} })).toThrow(/not allowed/);
    expect(() =>
      validateNewRoomEvent({ type: "attempt_failed", actorUserId: "u", payload: { position: 9, attempts: 1 } }),
    ).toThrow();
    expect(() =>
      validateNewRoomEvent({
        type: "lobby_updated",
        payload: { problemCount: 4, durationMin: 90, code: "print(1)" } as never,
      }),
    ).toThrow();
  });

  it("maps rows to the wire shape with a string id", () => {
    const createdAt = new Date("2026-10-24T18:04:00Z");
    expect(
      toRoomEvent({
        id: BigInt(106),
        type: "problem_solved",
        actorUserId: "u1",
        actorUsername: "bob",
        payload: { position: 1, solveSeconds: 240, wrongBefore: 0, firstSolver: true, solvedCount: 1 },
        createdAt,
      }),
    ).toEqual({
      id: "106",
      type: "problem_solved",
      at: "2026-10-24T18:04:00.000Z",
      actor: { userId: "u1", username: "bob" },
      payload: { position: 1, solveSeconds: 240, wrongBefore: 0, firstSolver: true, solvedCount: 1 },
    });
    expect(
      toRoomEvent({ id: 117, type: "session_ended", actorUserId: null, actorUsername: null, payload: { endedAt: "2026-10-24T19:30:00.000Z", reason: "time" }, createdAt }),
    ).toMatchObject({ id: "117", payload: { reason: "time" } });
    // Actor deleted → not shown.
    expect(toRoomEvent({ id: 1, type: "participant_joined", actorUserId: null, actorUsername: null, payload: {}, createdAt })).toBeNull();
  });

  it("cursor: canonical decimal bigint, anything else → null", () => {
    expect(encodeCursor(BigInt(105))).toBe("105");
    expect(decodeCursor("105")).toBe(BigInt(105));
    expect(decodeCursor("0")).toBe(BigInt(0));
    expect(decodeCursor("9223372036854775807")).toBe(BigInt("9223372036854775807"));
    for (const bad of [null, undefined, "", "01", "-1", "1.5", " 1", "1e3", "abc", "9223372036854775808", "99999999999999999999"]) {
      expect(decodeCursor(bad)).toBeNull();
    }
    expect(() => encodeCursor(-1)).toThrow(RangeError);
    expect(maxCursor("9", "10")).toBe("10");
    expect(maxCursor(null, "3")).toBe("3");
    expect(sessionLockKey("abc")).toBe("rs:abc");
  });
});
