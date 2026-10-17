// The polling RoomEventSource (docs/specs/rooms.md §3.2) with fake timers and
// a scripted fetch: intervals per state and visibility, stop when over,
// backoff, 429 Retry-After, 404/401, hasMore, de-duplication, snapshot every
// 10th poll, immediate polls on visibility/online/refresh.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  backoffDelay,
  createDedupe,
  createPollingEventSource,
  pollDelay,
  pollPhase,
  retryAfterMs,
  stateUrl,
  type PollBatch,
  type RoomEventStatus,
} from "@/lib/rooms/event-source";
import type { RoomEvent, StateResponse } from "@/lib/rooms/events";

const ROOM = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";

function event(id: number): RoomEvent {
  return { id: String(id), type: "session_cancelled", at: "2026-10-24T18:00:00.000Z" };
}

function state(over: Partial<StateResponse> = {}): StateResponse {
  return {
    serverNow: "2026-10-24T18:00:00.000Z",
    status: "live",
    endsAt: "2026-10-24T19:30:00.000Z",
    cursor: "0",
    events: [],
    hasMore: false,
    pendingJudging: 0,
    ...over,
  };
}

type Reply = StateResponse | { status: number; headers?: Record<string, string> } | Error;

function fakeResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return { status, ok: status >= 200 && status < 300, headers: new Headers(headers), json: async () => body } as Response;
}

/** fetch stub: replies are taken in order; the last one repeats. */
function scriptedFetch(replies: Reply[]) {
  const urls: string[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    urls.push(String(input));
    const reply = replies.length > 1 ? replies.shift()! : replies[0];
    if (reply instanceof Error) throw reply;
    // Plain objects instead of Response: body streams would wait on (faked) macrotasks.
    if ("serverNow" in reply) return fakeResponse(200, structuredClone(reply));
    return fakeResponse(reply.status, { error: "x" }, reply.headers);
  });
  return { fn: fn as unknown as typeof fetch, urls, calls: () => fn.mock.calls.length };
}

function fakeVisibility(hidden = false) {
  const listeners = new Set<() => void>();
  return {
    hidden,
    isHidden() {
      return this.hidden;
    },
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    set(h: boolean) {
      this.hidden = h;
      for (const l of listeners) l();
    },
  };
}

function fakeOnline() {
  const listeners = new Set<() => void>();
  return {
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    fire() {
      for (const l of listeners) l();
    },
  };
}

/** Lets pending promise callbacks (fetch, json) run. */
const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("pure helpers", () => {
  it("phases and delays follow the spec table", () => {
    expect(pollPhase("lobby", 0)).toBe("lobby");
    expect(pollPhase("live", 0)).toBe("live");
    expect(pollPhase("finished", 2)).toBe("finishedPending");
    expect(pollPhase("finished", 0)).toBe("done");
    expect(pollPhase("cancelled", 0)).toBe("done");
    expect(pollDelay("live", false)).toBe(3000);
    expect(pollDelay("live", true)).toBe(10_000);
    expect(pollDelay("lobby", false)).toBe(5000);
    expect(pollDelay("lobby", true)).toBe(15_000);
    expect(pollDelay("finishedPending", false)).toBe(3000);
    expect(pollDelay("done", false)).toBeNull();
    expect([1, 2, 3, 4, 5, 9].map((n) => backoffDelay(n))).toEqual([3000, 6000, 12_000, 30_000, 30_000, 30_000]);
    expect(retryAfterMs("7", 5000)).toBe(7000);
    expect(retryAfterMs(null, 5000)).toBe(5000);
    expect(retryAfterMs("soon", 5000)).toBe(5000);
  });

  it("state URL carries the cursor and the snapshot flag", () => {
    expect(stateUrl(ROOM, SESSION, null, false)).toBe(`/api/rooms/${ROOM}/sessions/${SESSION}/state`);
    expect(stateUrl(ROOM, SESSION, "105", true)).toBe(`/api/rooms/${ROOM}/sessions/${SESSION}/state?after=105&snapshot=1`);
  });

  it("dedupe remembers the last N ids", () => {
    const d = createDedupe(2);
    expect(d.add("1")).toBe(true);
    expect(d.add("1")).toBe(false);
    d.add("2");
    d.add("3");
    expect(d.has("1")).toBe(false);
    expect(d.add("3")).toBe(false);
  });
});

describe("createPollingEventSource", () => {
  function setup(replies: Reply[], { hidden = false } = {}) {
    const f = scriptedFetch(replies);
    const visibility = fakeVisibility(hidden);
    const online = fakeOnline();
    const source = createPollingEventSource({ roomId: ROOM, fetch: f.fn, visibility, online });
    const batches: PollBatch[] = [];
    const statuses: RoomEventStatus[] = [];
    return { f, visibility, online, source, batches, statuses, onBatch: (b: PollBatch) => batches.push(b), onStatus: (s: RoomEventStatus) => statuses.push(s) };
  }

  it("polls at once without a cursor, then every 3 s while live and visible", async () => {
    const t = setup([state({ cursor: "5", snapshot: undefined })]);
    const stop = t.source.subscribe(SESSION, null, t.onBatch, t.onStatus);
    await advance(0);
    expect(t.f.calls()).toBe(1);
    expect(t.f.urls[0]).toBe(`/api/rooms/${ROOM}/sessions/${SESSION}/state`);
    expect(t.statuses).toEqual(["connected"]);
    await advance(2999);
    expect(t.f.calls()).toBe(1);
    await advance(1);
    expect(t.f.calls()).toBe(2);
    expect(t.f.urls[1]).toContain("after=5");
    stop();
    await advance(10_000);
    expect(t.f.calls()).toBe(2);
  });

  it("10 s while live and hidden; 5 s / 15 s in the lobby; becoming visible polls at once", async () => {
    const t = setup([state()], { hidden: true });
    t.source.subscribe(SESSION, "0", t.onBatch, t.onStatus);
    await advance(0);
    await advance(9999);
    expect(t.f.calls()).toBe(1);
    await advance(1);
    expect(t.f.calls()).toBe(2);
    t.visibility.set(false);
    await flush();
    expect(t.f.calls()).toBe(3);

    const lobby = setup([state({ status: "lobby", endsAt: null })]);
    lobby.source.subscribe(SESSION, "0", lobby.onBatch, lobby.onStatus);
    await advance(0);
    await advance(4999);
    expect(lobby.f.calls()).toBe(1);
    await advance(1);
    expect(lobby.f.calls()).toBe(2);
    // Hidden from now on: the poll already scheduled runs, the next one waits 15 s.
    lobby.visibility.set(true);
    await advance(5000);
    expect(lobby.f.calls()).toBe(3);
    await advance(14_999);
    expect(lobby.f.calls()).toBe(3);
    await advance(1);
    expect(lobby.f.calls()).toBe(4);
  });

  it("keeps polling while finished results are judging, then stops", async () => {
    const t = setup([
      state({ status: "finished", pendingJudging: 1 }),
      state({ status: "finished", pendingJudging: 0, cursor: "9" }),
    ]);
    t.source.subscribe(SESSION, "0", t.onBatch, t.onStatus);
    await advance(0);
    await advance(3000);
    expect(t.f.calls()).toBe(2);
    await advance(60_000);
    expect(t.f.calls()).toBe(2);
    expect(t.batches.at(-1)).toMatchObject({ status: "finished", pendingJudging: 0, cursor: "9" });
  });

  it("stops for a cancelled session", async () => {
    const t = setup([state({ status: "cancelled", endsAt: null })]);
    t.source.subscribe(SESSION, "0", t.onBatch, t.onStatus);
    await advance(60_000);
    expect(t.f.calls()).toBe(1);
  });

  it("hasMore polls again immediately with the new cursor; events are de-duplicated by id", async () => {
    const t = setup([
      state({ cursor: "2", events: [event(1), event(2)], hasMore: true }),
      state({ cursor: "3", events: [event(2), event(3)] }),
      state({ cursor: "3" }),
    ]);
    t.source.subscribe(SESSION, "0", t.onBatch, t.onStatus);
    // Fake timers run a 0 ms timer scheduled inside a timer callback on the next ms.
    for (let i = 0; i < 4; i++) await advance(1);
    expect(t.f.calls()).toBe(2);
    expect(t.f.urls[1]).toContain("after=2");
    expect(t.batches.map((b) => b.events.map((e) => e.id))).toEqual([["1", "2"], ["3"]]);
  });

  it("backs off 3 → 6 → 12 → 30 s on errors and reports reconnecting after 2 failures", async () => {
    const t = setup([new Error("offline"), { status: 500 }, { status: 502 }, new Error("x"), { status: 503 }, state()]);
    t.source.subscribe(SESSION, "0", t.onBatch, t.onStatus);
    await advance(0);
    expect(t.statuses).toEqual([]);
    await advance(3000);
    expect(t.f.calls()).toBe(2);
    expect(t.statuses).toEqual(["reconnecting"]);
    await advance(5999);
    expect(t.f.calls()).toBe(2);
    await advance(1);
    expect(t.f.calls()).toBe(3);
    await advance(12_000);
    expect(t.f.calls()).toBe(4);
    await advance(29_999);
    expect(t.f.calls()).toBe(4);
    await advance(1);
    expect(t.f.calls()).toBe(5);
    await advance(30_000);
    expect(t.f.calls()).toBe(6);
    expect(t.statuses).toEqual(["reconnecting", "connected"]);
  });

  it("429 waits Retry-After", async () => {
    const t = setup([{ status: 429, headers: { "Retry-After": "7" } }, state()]);
    t.source.subscribe(SESSION, "0", t.onBatch, t.onStatus);
    await advance(0);
    await advance(6999);
    expect(t.f.calls()).toBe(1);
    await advance(1);
    expect(t.f.calls()).toBe(2);
  });

  it.each([
    [404, "gone"],
    [401, "unauthenticated"],
  ] as const)("%i stops with %s", async (status, expected) => {
    const t = setup([{ status }]);
    t.source.subscribe(SESSION, "0", t.onBatch, t.onStatus);
    await advance(60_000);
    expect(t.f.calls()).toBe(1);
    expect(t.statuses).toEqual([expected]);
  });

  it("asks for a snapshot every 10th poll", async () => {
    const t = setup([state({ cursor: "4" })]);
    t.source.subscribe(SESSION, "4", t.onBatch, t.onStatus);
    await advance(0);
    for (let i = 0; i < 10; i++) await advance(3000);
    const flagged = t.f.urls.map((u, i) => (u.includes("snapshot=1") ? i + 1 : null)).filter(Boolean);
    expect(flagged).toEqual([10]);
  });

  it("online and refresh() poll at once; a poll in flight is not duplicated", async () => {
    const t = setup([state()]);
    t.source.subscribe(SESSION, "0", t.onBatch, t.onStatus);
    await advance(0);
    expect(t.f.calls()).toBe(1);
    t.online.fire();
    await flush();
    expect(t.f.calls()).toBe(2);
    t.source.refresh();
    t.source.refresh();
    await flush();
    // The second refresh arrived while the first was in flight: one follow-up poll.
    await advance(1);
    expect(t.f.calls()).toBe(4);
    expect(t.batches).toHaveLength(4);
  });

  it("passes the snapshot and session state through", async () => {
    const snapshot = {
      session: { status: "live" as const, startedAt: null, endsAt: null, durationMin: 90, problemCount: 4 },
      problems: [],
      participants: [],
    };
    const t = setup([{ ...state({ cursor: "7", pendingJudging: 1, snapshot }), viewer: { isParticipant: true, canManage: false } } as StateResponse]);
    t.source.subscribe(SESSION, null, t.onBatch, t.onStatus);
    await advance(0);
    expect(t.batches[0]).toMatchObject({ cursor: "7", pendingJudging: 1, snapshot, status: "live", viewer: { isParticipant: true } });
  });
});
