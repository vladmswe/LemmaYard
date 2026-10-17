// Shared value types of the Rooms feature (docs/specs/rooms.md). Pure module:
// no DB or server imports, safe for the client. The DB enums in
// `src/server/db/schema.ts` are built from the tuples below, so the two never
// drift apart.
import { z } from "zod";

export const DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const ROOM_ROLES = ["owner", "member"] as const;
export type RoomRole = (typeof ROOM_ROLES)[number];

export const ROOM_SESSION_STATUSES = ["lobby", "live", "finished", "cancelled"] as const;
export type RoomSessionStatus = (typeof ROOM_SESSION_STATUSES)[number];

/** `room_sessions.end_reason`: finished → time | host, cancelled → cancelled | stale. */
export const ROOM_SESSION_END_REASONS = ["time", "host", "cancelled", "stale"] as const;
export type RoomSessionEndReason = (typeof ROOM_SESSION_END_REASONS)[number];

export const CHALLENGES = ["relaxed", "balanced", "tough"] as const;
export type Challenge = (typeof CHALLENGES)[number];

/** Problems per difficulty; always sums to the session's problem count. */
export type Mix = { easy: number; medium: number; hard: number };

export const MIN_PROBLEM_COUNT = 1;
export const MAX_PROBLEM_COUNT = 8;
export const DEFAULT_PROBLEM_COUNT = 4;
export const MIN_DURATION_MIN = 15;
export const MAX_DURATION_MIN = 240;
export const DURATION_STEP_MIN = 5;
export const DEFAULT_DURATION_MIN = 90;
export const MAX_SESSION_TAGS = 5;

const mixCount = z.number().int().min(0).max(MAX_PROBLEM_COUNT);
export const mixSchema = z.strictObject({ easy: mixCount, medium: mixCount, hard: mixCount });

/** Session settings as chosen in the lobby (`room_sessions.settings` jsonb). */
export const roomSessionSettingsSchema = z.strictObject({
  /** Tag slugs, 0..5; [] = any topic. */
  tags: z.array(z.string().min(1).max(64)).max(MAX_SESSION_TAGS),
  mixMode: z.enum(["suggested", "manual"]),
  /** The actual target mix used for the draw (pinned slots included). */
  mix: mixSchema,
  challenge: z.enum(CHALLENGES),
  avoidSolved: z.boolean(),
});
export type RoomSessionSettings = z.infer<typeof roomSessionSettingsSchema>;

export function mixTotal(mix: Mix): number {
  return mix.easy + mix.medium + mix.hard;
}

export function emptyMix(): Mix {
  return { easy: 0, medium: 0, hard: 0 };
}

export function mixOf(items: readonly { difficulty: Difficulty }[]): Mix {
  const mix = emptyMix();
  for (const item of items) mix[item.difficulty] += 1;
  return mix;
}
