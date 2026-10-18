// Rooms v2 §9.2 (AC-V2-LIVE-2): the poller speeds up to 1.5 s while a live
// session has a submit being judged (`pending`), back to 3 s otherwise, 10 s
// in a hidden tab; refresh, visibility and backoff behave as in v1. Fake
// timers and a scripted fetch, like event-source.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPollingEventSource, pollDelay, pollPhase, type PollBatch } from "@/lib/rooms/event-source";
import type { StateResponse } from "@/lib/rooms/events";

const ROOM = "11111111-1111-4111-8111-111111111111";
const SESSION = "22222222-2222-4222-8222-222222222222";
const judging = { userId: "u-bob", position: 2, count: 1 };

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

type Reply = StateResponse | Error;

function scriptedFetch(replies: Reply[]) {
  const fn = vi.fn(async () => {
    const reply = replies.length > 1 ? replies.shift()! : replies[0];
    if (reply instanceof Error) throw reply;
    return { status: 200, ok: true, headers: new Headers(), json: async () => structuredClone(reply) } as Response;
  });
  return { fn: fn as unknown as typeof fetch, calls: () => fn.mock.calls.length };
}

function fakeVisibility(hidden: boolean) {
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

const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
async function advance(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  await flush();
}

function setup(replies: Reply[], { hidden = false } = {}) {
  const f = scriptedFetch(replies);
  const visibility = fakeVisibility(hidden);
  const source = createPollingEventSource({
    roomId: ROOM,
    fetch: f.fn,
    visibility,
    online: { subscribe: () => () => {} },
  });
  const batches: PollBatch[] = [];
  source.subscribe(SESSION, null, (b) => batches.push(b), () => {});
  return { f, visibility, source, batches };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("liveJudging phase", () => {
  it("pure: live + pending → 1.5 s visible / 10 s hidden; the finished phase is unchanged", () => {
    expect(pollPhase("live", 0)).toBe("live");
    expect(pollPhase("live", 1)).toBe("liveJudging");
    expect(pollPhase("live", 0, 1)).toBe("liveJudging");
    expect(pollPhase("lobby", 0, 1)).toBe("lobby");
    expect(pollPhase("finished", 1, 1)).toBe("finishedPending");
    expect(pollDelay("liveJudging", false)).toBe(1500);
    expect(pollDelay("liveJudging", true)).toBe(10_000);
    expect(pollDelay("live", false)).toBe(3000);
  });

  it("1.5 s while the response lists pending cells, back to 3 s once it is empty", async () => {
    const t = setup([
      state({ cursor: "1", pendingJudging: 1, pending: [judging] }),
      state({ cursor: "1", pendingJudging: 1, pending: [judging] }),
      state({ cursor: "2", pending: [] }),
    ]);
    await advance(0);
    expect(t.f.calls()).toBe(1);
    expect(t.batches[0].pending).toEqual([judging]);
    await advance(1499);
    expect(t.f.calls()).toBe(1);
    await advance(1);
    expect(t.f.calls()).toBe(2);
    await advance(1500);
    expect(t.f.calls()).toBe(3);
    expect(t.batches[2].pending).toEqual([]);
    await advance(1500);
    expect(t.f.calls()).toBe(3);
    await advance(1500);
    expect(t.f.calls()).toBe(4);
  });

  it("hidden tab while judging: 10 s; becoming visible polls at once, then 1.5 s", async () => {
    const t = setup([state({ cursor: "1", pendingJudging: 1, pending: [judging] })], { hidden: true });
    await advance(0);
    await advance(9999);
    expect(t.f.calls()).toBe(1);
    await advance(1);
    expect(t.f.calls()).toBe(2);
    t.visibility.set(false);
    await advance(0);
    expect(t.f.calls()).toBe(3);
    await advance(1500);
    expect(t.f.calls()).toBe(4);
  });

  it("a v1-shaped response without `pending` still works (pending = [], 3 s)", async () => {
    const t = setup([state({ cursor: "1" })]);
    await advance(0);
    expect(t.batches[0].pending).toEqual([]);
    await advance(3000);
    expect(t.f.calls()).toBe(2);
  });

  it("refresh() (own verdict) polls at once and restarts the 1.5 s timer", async () => {
    const t = setup([state({ cursor: "1", pendingJudging: 1, pending: [judging] })]);
    await advance(0);
    await advance(500);
    t.source.refresh();
    await advance(0);
    expect(t.f.calls()).toBe(2);
    await advance(1499);
    expect(t.f.calls()).toBe(2);
    await advance(1);
    expect(t.f.calls()).toBe(3);
  });

  it("errors while judging still back off 3 → 6 s", async () => {
    const t = setup([
      state({ cursor: "1", pendingJudging: 1, pending: [judging] }),
      new Error("net"),
      new Error("net"),
      state({ cursor: "1" }),
    ]);
    await advance(0);
    await advance(1500);
    expect(t.f.calls()).toBe(2);
    await advance(2999);
    expect(t.f.calls()).toBe(2);
    await advance(1);
    expect(t.f.calls()).toBe(3);
    await advance(6000);
    expect(t.f.calls()).toBe(4);
  });
});
