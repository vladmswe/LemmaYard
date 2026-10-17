// Rooms R2 pure pieces: request schemas, the in-process limiter, the invite
// token's sessionStorage handoff and the room tab parser.
import { describe, expect, it } from "vitest";

import { parseRoomTab } from "@/components/rooms/room-page-slots";
import { generateInviteToken } from "@/lib/rooms/invite";
import {
  clearInviteToken,
  INVITE_STORAGE_KEY,
  INVITE_STORAGE_TTL_MS,
  readInviteToken,
  saveInviteToken,
  takeInviteToken,
} from "@/lib/rooms/invite-storage";
import {
  confirmsRoomName,
  createRoomBodySchema,
  deleteRoomBodySchema,
  inviteBodySchema,
  joinBodySchema,
  roomNameSchema,
  shareSolutionsBodySchema,
} from "@/lib/rooms/schemas";
import { clientAddress, createRateLimiter } from "@/server/http/rate-limit";

class MemoryStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

describe("roomNameSchema", () => {
  it.each([
    ["Saturday Algo Club", "Saturday Algo Club"],
    ["  padded  ", "padded"],
    ["x".repeat(60), "x".repeat(60)],
    ["日".repeat(60), "日".repeat(60)],
    ["😀".repeat(60), "😀".repeat(60)],
  ])("accepts %j", (input, out) => {
    expect(roomNameSchema.parse(input)).toBe(out);
  });

  it.each([["", "blank"], ["   ", "blank"], ["x".repeat(61), "61"], ["😀".repeat(61), "61 emoji"], ["a\u0000b", "NUL"], ["a\nb", "newline"], ["a\u007fb", "DEL"]])(
    "rejects %j (%s)",
    (input) => {
      expect(roomNameSchema.safeParse(input).success).toBe(false);
    },
  );

  it("bodies are strict", () => {
    expect(createRoomBodySchema.safeParse({ name: "a", extra: 1 }).success).toBe(false);
    expect(shareSolutionsBodySchema.safeParse({ shareSolutions: 1 }).success).toBe(false);
    expect(deleteRoomBodySchema.safeParse({ confirmName: "x".repeat(257) }).success).toBe(false);
    expect(joinBodySchema.safeParse({ token: "x".repeat(129) }).success).toBe(false);
  });
});

describe("inviteBodySchema", () => {
  it.each([1, 7, 30])("accepts rotate for %i days", (d) => {
    expect(inviteBodySchema.parse({ action: "rotate", expiresInDays: d })).toEqual({ action: "rotate", expiresInDays: d });
  });
  it.each([[0], [2], [31], ["7"], [7.5]])("rejects %j days", (d) => {
    expect(inviteBodySchema.safeParse({ action: "rotate", expiresInDays: d }).success).toBe(false);
  });
  it("disable takes no other keys", () => {
    expect(inviteBodySchema.safeParse({ action: "disable" }).success).toBe(true);
    expect(inviteBodySchema.safeParse({ action: "disable", expiresInDays: 7 }).success).toBe(false);
  });
});

describe("confirmsRoomName", () => {
  it("trims, is case-sensitive", () => {
    expect(confirmsRoomName(" Club ", "Club")).toBe(true);
    expect(confirmsRoomName("club", "Club")).toBe(false);
  });
});

describe("createRateLimiter", () => {
  it("allows `limit` hits per window and reports Retry-After", () => {
    const l = createRateLimiter({ limit: 3, windowMs: 60_000 });
    for (let i = 0; i < 3; i++) expect(l.hit("k", 1000 + i)).toEqual({ ok: true });
    expect(l.hit("k", 2000)).toEqual({ ok: false, retryAfterSec: 59 });
    expect(l.check("other", 2000)).toEqual({ ok: true });
    // The oldest hit leaves the window.
    expect(l.hit("k", 61_001)).toEqual({ ok: true });
  });
  it("check does not record; reset clears", () => {
    const l = createRateLimiter({ limit: 1, windowMs: 1000 });
    expect(l.check("k", 0).ok).toBe(true);
    expect(l.check("k", 0).ok).toBe(true);
    l.record("k", 0);
    expect(l.check("k", 1).ok).toBe(false);
    l.reset();
    expect(l.check("k", 1).ok).toBe(true);
  });
  it("clientAddress takes the first forwarded entry", () => {
    const req = (h: Record<string, string>) => new Request("http://x/", { headers: h });
    expect(clientAddress(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(clientAddress(req({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientAddress(req({}))).toBeNull();
  });
});

describe("invite token handoff (sessionStorage)", () => {
  const token = generateInviteToken();

  it("a fragment token is saved and wins over an older one", () => {
    const s = new MemoryStorage();
    saveInviteToken(s, generateInviteToken(), 0);
    expect(takeInviteToken(`#${token}`, s, 10)).toEqual({ token, hadFragment: true });
    expect(readInviteToken(s, 20)).toBe(token);
  });

  it("without a fragment the stored token is used (after the login redirect)", () => {
    const s = new MemoryStorage();
    saveInviteToken(s, token, 0);
    expect(takeInviteToken("", s, 1000)).toEqual({ token, hadFragment: false });
  });

  it("expires after the TTL and drops malformed entries", () => {
    const s = new MemoryStorage();
    saveInviteToken(s, token, 0);
    expect(readInviteToken(s, INVITE_STORAGE_TTL_MS + 1)).toBeNull();
    expect(s.getItem(INVITE_STORAGE_KEY)).toBeNull();
    s.setItem(INVITE_STORAGE_KEY, "{not json");
    expect(readInviteToken(s)).toBeNull();
    s.setItem(INVITE_STORAGE_KEY, JSON.stringify({ token: "short", savedAt: 0 }));
    expect(readInviteToken(s, 1)).toBeNull();
  });

  it("a malformed fragment clears the stored token", () => {
    const s = new MemoryStorage();
    saveInviteToken(s, token, 0);
    expect(takeInviteToken("#bad", s, 1)).toEqual({ token: null, hadFragment: true });
    expect(readInviteToken(s, 2)).toBeNull();
    clearInviteToken(s);
  });

  it("survives a storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(takeInviteToken(`#${token}`, broken)).toEqual({ token, hadFragment: true });
    expect(readInviteToken(broken)).toBeNull();
  });
});

describe("parseRoomTab", () => {
  it.each([
    ["members", "members"],
    ["leaderboard", "leaderboard"],
    [undefined, "sessions"],
    ["nope", "sessions"],
    [["members", "x"], "members"],
  ])("%j → %s", (input, out) => {
    expect(parseRoomTab(input)).toBe(out);
  });
});
