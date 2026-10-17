// Request bodies of the room, invite and membership routes
// (docs/specs/rooms.md §7.2, §8.6). Pure module: the client forms reuse the
// same rules. Every object is strict (extra keys → 400).
import { z } from "zod";

import { INVITE_EXPIRY_DAYS } from "./invite";

export const ROOM_NAME_MAX = 60;
/** Room bodies are tiny; PLAN §6 step 3 rejects anything larger with 413. */
export const ROOM_BODY_MAX_BYTES = 4096;
/** Spec §7.2: a room holds at most 20 members, a user at most 20 rooms. */
export const MAX_ROOM_MEMBERS = 20;
export const MAX_MEMBERSHIPS = 20;
export const MAX_OWNED_ROOMS = 5;
export const ROOM_CREATES_PER_HOUR = 5;

const CONTROL_CHARS = /\p{Cc}/u;

/** Length in code points, like Postgres `char_length` (the DB CHECK). */
export function nameLength(name: string): number {
  return [...name].length;
}

/** Trimmed, 1–60 characters, no control characters (incl. U+0000). */
export const roomNameSchema = z
  .string("Enter a room name")
  .trim()
  .refine((s) => s.length > 0, "Enter a room name")
  .refine((s) => nameLength(s) <= ROOM_NAME_MAX, `Use at most ${ROOM_NAME_MAX} characters`)
  .refine((s) => !CONTROL_CHARS.test(s), "The name contains characters that are not allowed");

export const createRoomBodySchema = z.strictObject({ name: roomNameSchema });
export const renameRoomBodySchema = z.strictObject({ name: roomNameSchema });
export const shareSolutionsBodySchema = z.strictObject({ shareSolutions: z.boolean() });

export const inviteBodySchema = z.discriminatedUnion("action", [
  z.strictObject({
    action: z.literal("rotate"),
    expiresInDays: z.union(INVITE_EXPIRY_DAYS.map((d) => z.literal(d))),
  }),
  z.strictObject({ action: z.literal("disable") }),
]);
export type InviteBody = z.infer<typeof inviteBodySchema>;

/**
 * Any short string: a token of the wrong format gets the same generic 404 as
 * an unknown one (§8.1), so the response never says which check failed.
 */
export const joinBodySchema = z.strictObject({ token: z.string().max(128) });

export const emptyBodySchema = z.strictObject({});

export const deleteRoomBodySchema = z.strictObject({ confirmName: z.string().max(256) });

/** Comparison used by the delete confirmation (trim only, case-sensitive). */
export function confirmsRoomName(input: string, name: string): boolean {
  return input.trim() === name;
}

export const INVITE_EXPIRY_LABELS: Record<(typeof INVITE_EXPIRY_DAYS)[number], string> = {
  1: "1 day",
  7: "7 days",
  30: "30 days",
};
