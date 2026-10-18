// Room session events and the state-poll contract (docs/specs/rooms.md §3.3,
// §7.2). Shared by the server (append + replay) and the client (polling
// event source). Payloads never contain code, verdict types, test data or
// problem titles.
import type { LeetCodeProvenance } from "@/lib/leetcode/labels";
import { z } from "zod";

import { DIFFICULTIES, ROOM_SESSION_STATUSES } from "./types";

export const ROOM_EVENT_TYPES = [
  "participant_joined",
  "lobby_updated",
  "session_started",
  "problem_solved",
  "attempt_failed",
  "session_ended",
  "session_cancelled",
  // rooms-external-problems §5: a participant took back a self-reported LeetCode solve.
  "solve_undone",
] as const;
export type RoomEventType = (typeof ROOM_EVENT_TYPES)[number];

/** DB CHECK `room_events_payload_size`. */
export const MAX_EVENT_PAYLOAD_BYTES = 2048;

const position = z.number().int().min(1).max(8);
const isoTime = z.iso.datetime({ offset: true });

/** Payload schema per event type (what is stored in `room_events.payload`). */
export const roomEventPayloadSchemas = {
  participant_joined: z.strictObject({}),
  lobby_updated: z.strictObject({
    problemCount: z.number().int().min(1).max(8),
    durationMin: z.number().int().min(15).max(240),
  }),
  session_started: z.strictObject({ startedAt: isoTime, endsAt: isoTime }),
  problem_solved: z.strictObject({
    position,
    solveSeconds: z.number().int().min(0),
    wrongBefore: z.number().int().min(0),
    firstSolver: z.boolean(),
    solvedCount: z.number().int().min(1).max(8),
    /** A LeetCode slot marked solved by the participant (honor system, not judged). */
    selfReported: z.literal(true).optional(),
  }),
  attempt_failed: z.strictObject({ position, attempts: z.number().int().min(1) }),
  session_ended: z.strictObject({ endedAt: isoTime, reason: z.enum(["time", "host"]) }),
  session_cancelled: z.strictObject({}),
  solve_undone: z.strictObject({ position, solvedCount: z.number().int().min(0).max(8) }),
} as const satisfies Record<RoomEventType, z.ZodType>;

export type RoomEventPayload<T extends RoomEventType> = z.infer<(typeof roomEventPayloadSchemas)[T]>;

/** Event types that carry an actor (the DB column `actor_user_id`). */
export const ACTOR_EVENT_TYPES: ReadonlySet<RoomEventType> = new Set([
  "participant_joined",
  "problem_solved",
  "attempt_failed",
  "solve_undone",
]);

export type Actor = { userId: string; username: string };

type Base<T extends RoomEventType> = { id: string; type: T; at: string };

export type RoomEvent =
  | (Base<"participant_joined"> & { actor: Actor })
  | (Base<"lobby_updated"> & { payload: RoomEventPayload<"lobby_updated"> })
  | (Base<"session_started"> & { payload: RoomEventPayload<"session_started"> })
  | (Base<"problem_solved"> & { actor: Actor; payload: RoomEventPayload<"problem_solved"> })
  | (Base<"attempt_failed"> & { actor: Actor; payload: RoomEventPayload<"attempt_failed"> })
  | (Base<"session_ended"> & { payload: RoomEventPayload<"session_ended"> })
  | Base<"session_cancelled">
  | (Base<"solve_undone"> & { actor: Actor; payload: RoomEventPayload<"solve_undone"> });

/** What the server appends (`appendRoomEvent`); validated before insert. */
export type NewRoomEvent = {
  [T in RoomEventType]: { type: T; actorUserId?: string | null; payload: RoomEventPayload<T> };
}[RoomEventType];

/**
 * Validates an event before insert: payload shape, actor presence and size.
 * Returns the payload to store or throws.
 */
export function validateNewRoomEvent(event: NewRoomEvent): Record<string, unknown> {
  const payload = roomEventPayloadSchemas[event.type].parse(event.payload) as Record<string, unknown>;
  const hasActor = event.actorUserId != null;
  if (ACTOR_EVENT_TYPES.has(event.type) !== hasActor) {
    throw new Error(`room event ${event.type}: actor ${hasActor ? "not allowed" : "required"}`);
  }
  if (new TextEncoder().encode(JSON.stringify(payload)).length > MAX_EVENT_PAYLOAD_BYTES) {
    throw new Error(`room event ${event.type}: payload too large`);
  }
  return payload;
}

/** A `room_events` row joined with the actor's username (query Q6). */
export type RoomEventRow = {
  id: bigint | number | string;
  type: RoomEventType;
  actorUserId: string | null;
  actorUsername: string | null;
  payload: unknown;
  createdAt: Date;
};

/**
 * Maps a stored row to the wire shape. Returns null for rows that cannot be
 * shown (e.g. the actor's account was deleted: actor set to NULL).
 */
export function toRoomEvent(row: RoomEventRow): RoomEvent | null {
  const id = encodeCursor(row.id);
  const at = row.createdAt.toISOString();
  const parsed = roomEventPayloadSchemas[row.type].safeParse(row.payload ?? {});
  if (!parsed.success) return null;
  let actor: Actor | undefined;
  if (ACTOR_EVENT_TYPES.has(row.type)) {
    if (row.actorUserId === null || row.actorUsername === null) return null;
    actor = { userId: row.actorUserId, username: row.actorUsername };
  }
  switch (row.type) {
    case "participant_joined":
      return { id, type: row.type, at, actor: actor! };
    case "problem_solved":
      return { id, type: row.type, at, actor: actor!, payload: parsed.data as RoomEventPayload<"problem_solved"> };
    case "attempt_failed":
      return { id, type: row.type, at, actor: actor!, payload: parsed.data as RoomEventPayload<"attempt_failed"> };
    case "lobby_updated":
      return { id, type: row.type, at, payload: parsed.data as RoomEventPayload<"lobby_updated"> };
    case "session_started":
      return { id, type: row.type, at, payload: parsed.data as RoomEventPayload<"session_started"> };
    case "session_ended":
      return { id, type: row.type, at, payload: parsed.data as RoomEventPayload<"session_ended"> };
    case "session_cancelled":
      return { id, type: row.type, at };
    case "solve_undone":
      return { id, type: row.type, at, actor: actor!, payload: parsed.data as RoomEventPayload<"solve_undone"> };
  }
}

// --- Cursor: the event's bigint id as a decimal string ---

const MAX_BIGINT = BigInt("9223372036854775807");
const CURSOR_PATTERN = /^(0|[1-9][0-9]{0,18})$/;

export function encodeCursor(id: bigint | number | string): string {
  const value = BigInt(id);
  if (value < BigInt(0) || value > MAX_BIGINT) throw new RangeError(`cursor out of range: ${value}`);
  return value.toString(10);
}

/**
 * Parses `?after=`. Anything that is not a canonical non-negative decimal
 * bigint returns null, which means "fresh snapshot, no events".
 */
export function decodeCursor(raw: string | null | undefined): bigint | null {
  if (typeof raw !== "string" || !CURSOR_PATTERN.test(raw)) return null;
  const value = BigInt(raw);
  return value > MAX_BIGINT ? null : value;
}

/** Larger of two cursors (null = none). */
export function maxCursor(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return BigInt(a) >= BigInt(b) ? a : b;
}

/** Events per state response; the server fetches one more to compute `hasMore`. */
export const EVENT_PAGE_SIZE = 100;

// --- State poll contract (§7.2) ---

export type SnapshotCell = {
  position: number;
  attempts: number;
  wrongBefore: number;
  solveSeconds: number | null;
  firstSolver: boolean;
  solvedBefore: boolean;
};

export type SessionSnapshot = {
  session: {
    status: (typeof ROOM_SESSION_STATUSES)[number];
    startedAt: string | null;
    endsAt: string | null;
    durationMin: number;
    problemCount: number;
  };
  /**
   * `slug`/`title` omitted in the lobby for non-hosts. A LeetCode slot
   * (rooms-external-problems) has no `slug` (it is not our problem) and an
   * `external` object; its slug and rating are omitted while titles are hidden.
   */
  problems: {
    position: number;
    slug?: string;
    title?: string;
    /** Null only for a LeetCode slot without a difficulty. */
    difficulty: (typeof DIFFICULTIES)[number] | null;
    tags: string[];
    /** `provenance` (catalog picks only): which values are estimates (leetcode-integration §6.8). */
    external?: { slug?: string; rating?: number | null; provenance?: LeetCodeProvenance };
  }[];
  participants: {
    userId: string;
    username: string;
    isHost: boolean;
    solvedCount: number;
    penaltySec: number;
    rank: number | null;
    cells: SnapshotCell[];
  }[];
};

export type RoomEventBatch = { cursor: string; events: RoomEvent[]; snapshot?: SessionSnapshot };

/**
 * Rooms v2 §9.2: a participant has a session submit for this problem that is
 * queued or running right now. Only that something is being judged (and how
 * many submits): never a verdict, code, test data or timing.
 */
export type PendingCell = { userId: string; position: number; count: number };

export type StateResponse = {
  serverNow: string;
  status: (typeof ROOM_SESSION_STATUSES)[number];
  endsAt: string | null;
  cursor: string;
  events: RoomEvent[];
  hasMore: boolean;
  snapshot?: SessionSnapshot;
  pendingJudging: number;
  /**
   * v2 (additive): (participant, problem) pairs with a submit being judged now.
   * Empty in the lobby. Optional on the type so v1-shaped responses still parse.
   */
  pending?: PendingCell[];
};

/** Advisory-lock key text for a session: `pg_advisory_xact_lock(hashtext('rs:' || id))`. */
export function sessionLockKey(sessionId: string): string {
  return `rs:${sessionId}`;
}
