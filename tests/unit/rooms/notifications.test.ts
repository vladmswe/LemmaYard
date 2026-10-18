import { describe, expect, it } from "vitest";

import type { RoomEvent } from "@/lib/rooms/events";
import {
  BATCH_THRESHOLD,
  batchNotices,
  browserNotificationTag,
  browserPermissionHelp,
  DEFAULT_NOTIFICATION_PREFS,
  eventNotice,
  feedLine,
  isHistoryEvent,
  loadNotificationPrefs,
  migrateNotificationPrefsV1,
  NOTIFICATION_PREFS_KEY,
  NOTIFICATION_PREFS_KEY_V1,
  parseNotificationPrefs,
  saveNotificationPrefs,
  shouldPlaySound,
  shouldShowBrowserNotification,
  type NoticeContext,
} from "@/lib/rooms/notifications";

const ctx: NoticeContext = {
  viewerId: "me",
  titles: new Map([[2, "Coin Change"]]),
  problemCount: 4,
  durationMin: 90,
  showAttempts: false,
  links: { scoreboard: "/s#scoreboard", results: "/s/results", firstProblem: "/problems/a?session=s" },
};

const alice = { userId: "u-alice", username: "alice" };
const solved = (id: string, extra: Partial<{ solveSeconds: number; wrongBefore: number; firstSolver: boolean }> = {}, actor = alice): RoomEvent => ({
  id,
  type: "problem_solved",
  at: "2026-10-24T18:23:41.000Z",
  actor,
  payload: { position: 2, solveSeconds: 1421, wrongBefore: 0, firstSolver: false, solvedCount: 1, ...extra },
});

describe("toast copy (spec §3.5)", () => {
  it("someone else's solve, with the three description variants", () => {
    expect(eventNotice(solved("1", { firstSolver: true }), ctx, true)).toMatchObject({
      kind: "solved",
      title: "alice solved Problem 2 · Coin Change",
      description: "at 23:41 · first to solve it",
      action: { label: "Scoreboard", href: "/s#scoreboard" },
    });
    expect(eventNotice(solved("2", { solveSeconds: 1865, wrongBefore: 2 }), ctx, true)?.description).toBe(
      "at 31:05 · after 2 wrong attempts",
    );
    expect(eventNotice(solved("3", { solveSeconds: 1082 }), ctx, true)?.description).toBe("at 18:02");
  });

  it("never toasts the viewer's own solve", () => {
    expect(eventNotice(solved("4", {}, { userId: "me", username: "me" }), ctx, true)).toBeNull();
  });

  it("failed attempts follow the switch (v2 default on), without verdicts", () => {
    const e: RoomEvent = { id: "5", type: "attempt_failed", at: "", actor: { userId: "b", username: "bob" }, payload: { position: 3, attempts: 1 } };
    expect(eventNotice(e, ctx, true)).toBeNull();
    const notice = eventNotice(e, { ...ctx, showAttempts: true }, true);
    expect(notice?.title).toBe("bob's attempt on Problem 3 was not accepted");
    expect(JSON.stringify(notice)).not.toMatch(/wrong answer|time limit|runtime|memory/i);
    // Own failed attempts are never toasted.
    expect(eventNotice({ ...e, actor: { userId: "me", username: "me" } }, { ...ctx, showAttempts: true }, true)).toBeNull();
    expect(feedLine(e, ctx, null)?.text).toBe("bob's attempt on Problem 3 was not accepted");
  });

  it("joins only while live; start and end", () => {
    const join: RoomEvent = { id: "6", type: "participant_joined", at: "", actor: { userId: "c", username: "carol" } };
    expect(eventNotice(join, ctx, false)).toBeNull();
    expect(eventNotice(join, ctx, true)?.title).toBe("carol joined the session");
    const start: RoomEvent = { id: "7", type: "session_started", at: "", payload: { startedAt: "2026-10-24T18:00:00Z", endsAt: "2026-10-24T19:30:00Z" } };
    expect(eventNotice(start, ctx, true)).toMatchObject({
      title: "The session has started",
      description: "4 problems · 90 minutes. Good luck.",
      action: { label: "Open Problem 1" },
    });
    const end: RoomEvent = { id: "8", type: "session_ended", at: "", payload: { endedAt: "2026-10-24T19:30:00Z", reason: "time" } };
    expect(eventNotice(end, ctx, true)).toMatchObject({ title: "Time is up", description: "Final results are ready.", action: { label: "Results" } });
  });

  it("titles are left out while hidden", () => {
    expect(eventNotice(solved("9"), { ...ctx, titles: new Map() }, true)?.title).toBe("alice solved Problem 2");
  });
});

describe("batching and de-duplication", () => {
  it(`fewer than ${BATCH_THRESHOLD} pass through, more collapse into one`, () => {
    const notices = ["1", "2", "3"].map((id) => eventNotice(solved(id), ctx, true)!);
    expect(batchNotices(notices, "/sb")).toHaveLength(3);
    const many = [...notices, eventNotice(solved("4", {}, { userId: "x", username: "x" }), ctx, true)!];
    expect(batchNotices(many, "/sb")).toEqual([
      { id: "batch-1-4", kind: "batch", title: "4 updates while you were away", action: { label: "Scoreboard", href: "/sb" } },
    ]);
  });

  it("history events are the ones up to the initial cursor", () => {
    expect(isHistoryEvent("104", "105")).toBe(true);
    expect(isHistoryEvent("105", "105")).toBe(true);
    expect(isHistoryEvent("106", "105")).toBe(false);
    expect(isHistoryEvent("106", null)).toBe(false);
    expect(isHistoryEvent("x", "1")).toBe(false);
  });

  it("feed lines: past tense with the session clock", () => {
    const a = feedLine(solved("1"), ctx, "2026-10-24T18:00:00.000Z")!;
    const b = feedLine(solved("2", { firstSolver: true }), ctx, null)!;
    expect(a).toMatchObject({ kind: "solved", clock: "23:41", text: "alice solved Problem 2 · Coin Change" });
    expect(b.text).toBe("alice solved Problem 2 · Coin Change (first)");
    const joined = feedLine({ id: "3", type: "participant_joined", at: "2026-10-24T18:05:00.000Z", actor: alice }, ctx, "2026-10-24T18:00:00.000Z");
    expect(joined).toMatchObject({ kind: "joined", clock: "5:00", text: "alice joined the session" });
    expect(feedLine({ id: "4", type: "lobby_updated", at: "", payload: { problemCount: 4, durationMin: 90 } }, ctx, null)).toBeNull();
    expect(feedLine({ id: "5", type: "session_ended", at: "", payload: { endedAt: "", reason: "host" } }, ctx, null)?.text).toBe(
      "The host ended the session",
    );
  });
});

describe("preferences", () => {
  function memory(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
  }

  it("defaults: toasts on, failed attempts on (v2), sound and browser off", () => {
    expect(DEFAULT_NOTIFICATION_PREFS).toEqual({ toasts: true, sound: false, browser: false, showAttempts: true });
    expect(loadNotificationPrefs(null)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(loadNotificationPrefs(memory())).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it("AC-V2-LIVE-3: a v1 stored object keeps sound/browser/toasts and gets showAttempts = true; muting persists", () => {
    const s = memory({ [NOTIFICATION_PREFS_KEY_V1]: JSON.stringify({ toasts: false, sound: true, browser: true, showAttempts: false }) });
    const migrated = loadNotificationPrefs(s);
    expect(migrated).toEqual({ toasts: false, sound: true, browser: true, showAttempts: true });
    // Stored under v2 right away, so the next read does not migrate again.
    expect(JSON.parse(s.data.get(NOTIFICATION_PREFS_KEY)!)).toEqual(migrated);
    // The person mutes failed attempts: it sticks (the v2 key wins over v1).
    saveNotificationPrefs(s, { ...migrated, showAttempts: false });
    expect(loadNotificationPrefs(s).showAttempts).toBe(false);
    expect(migrateNotificationPrefsV1("{garbage")).toEqual(DEFAULT_NOTIFICATION_PREFS);
  });

  it("round-trips under a versioned key and survives garbage", () => {
    const s = memory();
    expect(saveNotificationPrefs(s, { ...DEFAULT_NOTIFICATION_PREFS, sound: true })).toBe(true);
    expect(NOTIFICATION_PREFS_KEY).toMatch(/:v2$/);
    expect(NOTIFICATION_PREFS_KEY_V1).toMatch(/:v1$/);
    expect(loadNotificationPrefs(s).sound).toBe(true);
    expect(parseNotificationPrefs("{not json")).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(parseNotificationPrefs('{"sound":"yes","toasts":false}')).toEqual({ ...DEFAULT_NOTIFICATION_PREFS, toasts: false });
  });

  it("storage that throws is tolerated", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(loadNotificationPrefs(broken)).toEqual(DEFAULT_NOTIFICATION_PREFS);
    expect(saveNotificationPrefs(broken, DEFAULT_NOTIFICATION_PREFS)).toBe(false);
  });

  it("browser notifications only hidden + on + granted; sound only for solves", () => {
    const on = { ...DEFAULT_NOTIFICATION_PREFS, browser: true, sound: true };
    expect(shouldShowBrowserNotification(on, { hidden: true, permission: "granted" })).toBe(true);
    expect(shouldShowBrowserNotification(on, { hidden: false, permission: "granted" })).toBe(false);
    expect(shouldShowBrowserNotification(on, { hidden: true, permission: "denied" })).toBe(false);
    expect(shouldShowBrowserNotification(DEFAULT_NOTIFICATION_PREFS, { hidden: true, permission: "granted" })).toBe(false);
    expect(shouldPlaySound(on, { id: "1", kind: "solved", title: "" })).toBe(true);
    expect(shouldPlaySound(on, { id: "1", kind: "joined", title: "" })).toBe(false);
    expect(shouldPlaySound(DEFAULT_NOTIFICATION_PREFS, { id: "1", kind: "solved", title: "" })).toBe(false);
    expect(browserNotificationTag("s1", "42")).toBe("rs-s1-42");
    expect(browserPermissionHelp("denied")).toBe("Blocked in your browser settings.");
    expect(browserPermissionHelp("unsupported")).toMatch(/Home Screen/);
  });
});
