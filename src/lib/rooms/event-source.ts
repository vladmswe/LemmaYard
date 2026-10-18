// Client side of the live session updates (docs/specs/rooms.md §3.2): an
// adaptive short-polling RoomEventSource over
// GET /api/rooms/:roomId/sessions/:sessionId/state. The UI (R4) depends only on
// the RoomEventSource interface, so a push transport (v2: Supabase Broadcast
// "poke" that triggers the same state request) can replace it without UI
// changes. Pure module: timers, fetch, visibility and online events are
// injectable (fake timers in tests); no React, no server imports.
import type { PendingCell, RoomEventBatch, StateResponse } from "./events";
import type { RoomSessionStatus } from "./types";

export type RoomEventStatus = "connected" | "reconnecting" | "gone" | "unauthenticated";

/** One delivered state response: events (de-duplicated) plus the session's current state. */
export type PollBatch = RoomEventBatch & {
  serverNow: string;
  status: RoomSessionStatus;
  endsAt: string | null;
  pendingJudging: number;
  /** v2: (participant, problem) pairs being judged now ([] when the server sent none). */
  pending: PendingCell[];
  hasMore: boolean;
  viewer?: { isParticipant: boolean; canManage: boolean };
};

export interface RoomEventSource {
  /** Starts delivering batches from `cursor` (null = from now with a full snapshot). Returns unsubscribe. */
  subscribe(
    sessionId: string,
    cursor: string | null,
    onBatch: (b: PollBatch) => void,
    onStatus: (s: RoomEventStatus) => void,
  ): () => void;
}

export type PollingEventSource = RoomEventSource & {
  /** Polls every subscription now (e.g. right after the user's own submit got its verdict). */
  refresh(): void;
};

type Interval = { visible: number; hidden: number };

export type PollSchedule = {
  lobby: Interval;
  live: Interval;
  /** v2 §9.2: live while somebody's session submit is queued or running. */
  liveJudging: Interval;
  /** Finished, while session submissions are still being judged. */
  finishedPending: Interval;
  /** Delays after consecutive failures (network error / 5xx); the last one repeats. */
  backoffMs: readonly number[];
  /** "Reconnecting…" is reported from this many consecutive failures on. */
  reconnectingAfter: number;
  /** Retry-After default for a 429 without the header. */
  rateLimitedMs: number;
  /** Every n-th poll asks for a full snapshot (self-healing). */
  snapshotEvery: number;
  /** Event ids remembered for de-duplication. */
  dedupeWindow: number;
};

/** Spec §3.2 polling table (+ v2 §9.2: 1.5 s while judging). */
export const DEFAULT_POLL_SCHEDULE: PollSchedule = {
  lobby: { visible: 5000, hidden: 15_000 },
  live: { visible: 3000, hidden: 10_000 },
  liveJudging: { visible: 1500, hidden: 10_000 },
  finishedPending: { visible: 3000, hidden: 10_000 },
  backoffMs: [3000, 6000, 12_000, 30_000],
  reconnectingAfter: 2,
  rateLimitedMs: 5000,
  snapshotEvery: 10,
  dedupeWindow: 200,
};

export type PollPhase = "lobby" | "live" | "liveJudging" | "finishedPending" | "done";

/**
 * `pendingJudging` = session submits queued or running (the state response's
 * count); `pendingCells` = the v2 `pending` list length. Either one makes a
 * live session poll faster.
 */
export function pollPhase(status: RoomSessionStatus, pendingJudging: number, pendingCells = 0): PollPhase {
  if (status === "lobby") return "lobby";
  if (status === "live") return pendingJudging > 0 || pendingCells > 0 ? "liveJudging" : "live";
  if (status === "finished" && pendingJudging > 0) return "finishedPending";
  return "done";
}

/** Next regular poll delay, or null to stop. */
export function pollDelay(phase: PollPhase, hidden: boolean, schedule: PollSchedule = DEFAULT_POLL_SCHEDULE) {
  if (phase === "done") return null;
  const interval = schedule[phase];
  return hidden ? interval.hidden : interval.visible;
}

/** Delay after the n-th consecutive failure (1-based): 3 → 6 → 12 → 30 s (cap). */
export function backoffDelay(failures: number, schedule: PollSchedule = DEFAULT_POLL_SCHEDULE): number {
  const list = schedule.backoffMs;
  return list[Math.min(Math.max(1, failures), list.length) - 1];
}

/** Retry-After in seconds (integer) → ms; anything else → the default. */
export function retryAfterMs(header: string | null, fallbackMs: number): number {
  if (header && /^\d{1,4}$/.test(header.trim())) return Math.max(1, Number(header.trim())) * 1000;
  return fallbackMs;
}

export function stateUrl(roomId: string, sessionId: string, cursor: string | null, snapshot: boolean): string {
  const params = new URLSearchParams();
  if (cursor !== null) params.set("after", cursor);
  if (snapshot) params.set("snapshot", "1");
  const query = params.toString();
  return `/api/rooms/${encodeURIComponent(roomId)}/sessions/${encodeURIComponent(sessionId)}/state${query ? `?${query}` : ""}`;
}

/** Remembers the last `size` ids; `add` returns false for a duplicate. */
export function createDedupe(size: number) {
  const order: string[] = [];
  const seen = new Set<string>();
  return {
    add(id: string): boolean {
      if (seen.has(id)) return false;
      seen.add(id);
      order.push(id);
      while (order.length > size) seen.delete(order.shift()!);
      return true;
    },
    has: (id: string) => seen.has(id),
  };
}

export type VisibilityLike = {
  isHidden(): boolean;
  /** Calls `onChange` on every visibility change; returns unsubscribe. */
  subscribe(onChange: () => void): () => void;
};

export type OnlineLike = { subscribe(onOnline: () => void): () => void };

export type PollingOptions = {
  roomId: string;
  fetch?: typeof fetch;
  schedule?: Partial<PollSchedule>;
  visibility?: VisibilityLike;
  online?: OnlineLike;
};

function browserVisibility(): VisibilityLike {
  if (typeof document === "undefined") return { isHidden: () => false, subscribe: () => () => {} };
  return {
    isHidden: () => document.visibilityState === "hidden",
    subscribe(onChange) {
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    },
  };
}

function browserOnline(): OnlineLike {
  if (typeof window === "undefined") return { subscribe: () => () => {} };
  return {
    subscribe(onOnline) {
      window.addEventListener("online", onOnline);
      return () => window.removeEventListener("online", onOnline);
    },
  };
}

type StateBody = StateResponse & { viewer?: PollBatch["viewer"] };

/**
 * The v1 transport (§3.2): 5 s lobby, 3 s live and while finished results are
 * still judging, 1.5 s while live with a submit being judged (v2 §9.2; 10–15 s
 * in hidden tabs), stop when over; immediate poll on
 * becoming visible, on `online` and on `refresh()`; `hasMore` → poll again at
 * once; backoff 3 → 6 → 12 → 30 s on errors ("reconnecting" after 2); 429 waits
 * Retry-After; 404 → "gone", 401 → "unauthenticated" (both stop).
 */
export function createPollingEventSource(options: PollingOptions): PollingEventSource {
  const schedule: PollSchedule = { ...DEFAULT_POLL_SCHEDULE, ...options.schedule };
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const visibility = options.visibility ?? browserVisibility();
  const online = options.online ?? browserOnline();
  const subscriptions = new Set<{ pollNow(): void }>();

  return {
    refresh() {
      for (const s of subscriptions) s.pollNow();
    },
    subscribe(sessionId, initialCursor, onBatch, onStatus) {
      let cursor = initialCursor;
      let stopped = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      let inFlight: AbortController | null = null;
      let pollAgain = false;
      let failures = 0;
      let polls = 0;
      let reported: RoomEventStatus | null = null;
      let phase: PollPhase = "live";
      const dedupe = createDedupe(schedule.dedupeWindow);

      const report = (s: RoomEventStatus) => {
        if (reported === s) return;
        reported = s;
        onStatus(s);
      };
      const schedulePoll = (ms: number) => {
        if (stopped) return;
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          void poll();
        }, ms);
      };
      const stop = () => {
        stopped = true;
        if (timer !== null) clearTimeout(timer);
        timer = null;
        inFlight?.abort();
        inFlight = null;
        subscriptions.delete(handle);
        unsubscribeVisibility();
        unsubscribeOnline();
      };
      const fail = () => {
        failures += 1;
        if (failures >= schedule.reconnectingAfter) report("reconnecting");
        schedulePoll(backoffDelay(failures, schedule));
      };

      async function poll(): Promise<void> {
        if (stopped) return;
        if (inFlight) {
          pollAgain = true;
          return;
        }
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        polls += 1;
        const wantSnapshot = cursor !== null && polls % schedule.snapshotEvery === 0;
        const controller = new AbortController();
        inFlight = controller;
        let response: Response;
        try {
          response = await doFetch(stateUrl(options.roomId, sessionId, cursor, wantSnapshot), {
            method: "GET",
            cache: "no-store",
            credentials: "same-origin",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
        } catch {
          inFlight = null;
          if (!stopped) fail();
          return;
        }
        if (stopped) return;
        if (response.status === 404) {
          inFlight = null;
          report("gone");
          return stop();
        }
        if (response.status === 401) {
          inFlight = null;
          report("unauthenticated");
          return stop();
        }
        if (response.status === 429) {
          inFlight = null;
          return schedulePoll(retryAfterMs(response.headers.get("retry-after"), schedule.rateLimitedMs));
        }
        let body: StateBody;
        try {
          if (!response.ok) throw new Error(`state ${response.status}`);
          body = (await response.json()) as StateBody;
        } catch {
          inFlight = null;
          if (!stopped) fail();
          return;
        }
        inFlight = null;
        if (stopped) return;
        failures = 0;
        report("connected");
        cursor = body.cursor;
        const events = body.events.filter((e) => dedupe.add(e.id));
        const pending = Array.isArray(body.pending) ? body.pending : [];
        phase = pollPhase(body.status, body.pendingJudging, pending.length);
        onBatch({
          cursor: body.cursor,
          events,
          ...(body.snapshot ? { snapshot: body.snapshot } : {}),
          serverNow: body.serverNow,
          status: body.status,
          endsAt: body.endsAt,
          pendingJudging: body.pendingJudging,
          pending,
          hasMore: body.hasMore,
          ...(body.viewer ? { viewer: body.viewer } : {}),
        });
        if (stopped) return;
        if (body.hasMore || pollAgain) {
          pollAgain = false;
          return schedulePoll(0);
        }
        const delay = pollDelay(phase, visibility.isHidden(), schedule);
        if (delay === null) return stop();
        schedulePoll(delay);
      }

      const handle = {
        pollNow() {
          if (stopped) return;
          void poll();
        },
      };
      subscriptions.add(handle);
      const unsubscribeVisibility = visibility.subscribe(() => {
        if (!visibility.isHidden()) handle.pollNow();
      });
      const unsubscribeOnline = online.subscribe(() => handle.pollNow());
      schedulePoll(0);
      return stop;
    },
  };
}
