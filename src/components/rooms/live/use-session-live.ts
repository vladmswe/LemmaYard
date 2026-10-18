"use client";

// Live session state on the client: subscribes to R3's polling
// RoomEventSource (docs/specs/rooms.md §3.2) and keeps the latest status,
// server clock offset, snapshot and connection state. Events are handed to
// `onEvents` (feed, notifications); the UI never polls by itself.
import { useCallback, useEffect, useRef, useState } from "react";

import { createPollingEventSource, type PollBatch, type PollingEventSource, type RoomEventStatus } from "@/lib/rooms/event-source";
import type { PendingCell, RoomEvent, SessionSnapshot, StateResponse } from "@/lib/rooms/events";
import { clockOffset, nextOffset } from "@/lib/rooms/live-clock";
import { nextJudgingEntries, type JudgingEntry } from "@/lib/rooms/notifications";
import type { RoomSessionStatus } from "@/lib/rooms/types";

import { OWN_SUBMIT_FINAL_EVENT } from "./alerts";

export type InitialState = StateResponse & { viewer?: { isParticipant: boolean; canManage: boolean } };

export type LiveState = {
  status: RoomSessionStatus;
  endsAt: string | null;
  /** `server − client` clock offset in ms. */
  offsetMs: number;
  snapshot: SessionSnapshot | null;
  pendingJudging: number;
  /** v2: (participant, problem) pairs being judged now. */
  pending: PendingCell[];
  /** "Judging…" feed entries derived from `pending` (client-only, never stored). */
  judging: JudgingEntry[];
  viewer: { isParticipant: boolean; canManage: boolean };
  connection: RoomEventStatus;
  cursor: string;
};

export type UseSessionLiveOptions = {
  roomId: string;
  sessionId: string;
  initial: InitialState;
  /** Cursor to start from: the initial cursor (only new events) or "0" (replay history into the feed). */
  fromCursor: string | null;
  onEvents?: (events: RoomEvent[], batch: PollBatch) => void;
  /** Tests / screenshots: a different transport. */
  source?: PollingEventSource;
};

function usernames(snapshot: SessionSnapshot | null): Map<string, string> {
  return new Map((snapshot?.participants ?? []).map((p) => [p.userId, p.username]));
}

function initialLiveState(initial: InitialState): LiveState {
  const snapshot = initial.snapshot ?? null;
  return {
    judging: nextJudgingEntries([], initial.pending ?? [], usernames(snapshot), initial.serverNow),
    status: initial.status,
    endsAt: initial.endsAt,
    offsetMs: clockOffset(initial.serverNow, Date.now()),
    snapshot: initial.snapshot ?? null,
    pendingJudging: initial.pendingJudging,
    pending: initial.pending ?? [],
    viewer: initial.viewer ?? { isParticipant: false, canManage: false },
    connection: "connected",
    cursor: initial.cursor,
  };
}

export function useSessionLive({ roomId, sessionId, initial, fromCursor, onEvents, source }: UseSessionLiveOptions) {
  const [state, setState] = useState<LiveState>(() => initialLiveState(initial));
  const onEventsRef = useRef(onEvents);
  useEffect(() => {
    onEventsRef.current = onEvents;
  }, [onEvents]);
  const sourceRef = useRef<PollingEventSource | null>(null);
  const startCursor = useRef(fromCursor);

  useEffect(() => {
    const es = source ?? createPollingEventSource({ roomId });
    sourceRef.current = es;
    const unsubscribe = es.subscribe(
      sessionId,
      startCursor.current,
      (batch) => {
        const received = Date.now();
        setState((prev) => {
          const snapshot = batch.snapshot ?? prev.snapshot;
          return {
          ...prev,
          judging: nextJudgingEntries(prev.judging, batch.pending, usernames(snapshot), batch.serverNow),
          status: batch.status,
          endsAt: batch.endsAt,
          offsetMs: nextOffset(prev.offsetMs, clockOffset(batch.serverNow, received)),
          snapshot: batch.snapshot ?? prev.snapshot,
          pendingJudging: batch.pendingJudging,
          pending: batch.pending,
          viewer: batch.viewer ?? prev.viewer,
          cursor: batch.cursor,
          connection: "connected",
          };
        });
        if (batch.events.length > 0) onEventsRef.current?.(batch.events, batch);
      },
      (connection) => setState((prev) => (prev.connection === connection ? prev : { ...prev, connection })),
    );
    const onOwnSubmit = () => es.refresh();
    window.addEventListener(OWN_SUBMIT_FINAL_EVENT, onOwnSubmit);
    return () => {
      window.removeEventListener(OWN_SUBMIT_FINAL_EVENT, onOwnSubmit);
      unsubscribe();
      sourceRef.current = null;
    };
  }, [roomId, sessionId, source]);

  /** Poll now (after an own action, or when the countdown reaches zero). */
  const refresh = useCallback(() => sourceRef.current?.refresh(), []);

  /** Local update after an own mutation (e.g. join) before the next poll confirms it. */
  const patch = useCallback((p: Partial<LiveState>) => setState((prev) => ({ ...prev, ...p })), []);

  return { ...state, refresh, patch };
}
