// Room profile, presets and weekly schedule (docs/specs/rooms-v2.md §4, §5,
// §11). Owner-only writes through `roomMutation` (Origin/Content-Type 403 →
// 401 → body 413/400 → non-member 404 → member 403 → write, under the room
// lock). The pure rules live in src/lib/rooms/room-defaults.ts.
import { eq } from "drizzle-orm";
import type { NextResponse } from "next/server";

import {
  applyPresetsAction,
  defaultPreset,
  newPresetId,
  presetsBodySchema,
  resolvePresets,
  roomProfileBodySchema,
  scheduleBodySchema,
  type SessionTemplate,
} from "@/lib/rooms/room-defaults";
import { rooms } from "@/server/db/schema";
import { jsonError } from "@/server/http/request";
import { createRateLimiter } from "@/server/http/rate-limit";

import { json, roomMutation, tooMany } from "./http";
import type { Tx } from "./queries";

const HOUR_MS = 60 * 60 * 1000;
/** Owner settings writes per room (in-process, soft; hygiene only). */
export const roomSettingsLimiter = createRateLimiter({ limit: 60, windowMs: HOUR_MS });

type DefaultsRow = {
  description: string | null;
  color: number;
  presets: unknown;
  defaultPresetId: string | null;
  schedule: unknown;
};

async function loadDefaultsRow(tx: Tx, roomId: string): Promise<DefaultsRow | null> {
  const [row] = await tx
    .select({
      description: rooms.description,
      color: rooms.color,
      presets: rooms.presets,
      defaultPresetId: rooms.defaultPresetId,
      schedule: rooms.schedule,
    })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);
  return row ?? null;
}

/**
 * The template a new session starts from: `presetId` when given (null when
 * unknown → the caller answers 400), else the room's default preset.
 */
export async function loadSessionTemplate(
  tx: Tx,
  roomId: string,
  presetId: string | undefined,
): Promise<SessionTemplate | null> {
  const row = await loadDefaultsRow(tx, roomId);
  const presets = resolvePresets(row?.presets ?? null);
  if (presetId !== undefined) return presets.find((p) => p.id === presetId) ?? null;
  return defaultPreset(presets, row?.defaultPresetId ?? null);
}

function limited(roomId: string): NextResponse | null {
  const r = roomSettingsLimiter.hit(roomId);
  return r.ok ? null : tooMany("Too many changes to this room. Try again later.", r.retryAfterSec);
}

/** POST /api/rooms/:roomId/profile (owner): `{name?, description?, color?}`. */
export function updateRoomProfile(request: Request, roomId: string) {
  return roomMutation(request, roomId, roomProfileBodySchema, { ownerOnly: true }, async ({ tx, data }) => {
    const blocked = limited(roomId);
    if (blocked) return blocked;
    const set: Partial<typeof rooms.$inferInsert> = {};
    if (data.name !== undefined) set.name = data.name;
    if (data.description !== undefined) set.description = data.description === "" ? null : data.description;
    if (data.color !== undefined) set.color = data.color;
    const [row] = await tx
      .update(rooms)
      .set(set)
      .where(eq(rooms.id, roomId))
      .returning({ name: rooms.name, description: rooms.description, color: rooms.color });
    return json(row);
  });
}

/** POST /api/rooms/:roomId/presets (owner): save / delete / default. */
export function updateRoomPresets(request: Request, roomId: string) {
  return roomMutation(request, roomId, presetsBodySchema, { ownerOnly: true }, async ({ tx, data }) => {
    const blocked = limited(roomId);
    if (blocked) return blocked;
    const row = await loadDefaultsRow(tx, roomId);
    if (!row) return jsonError(404, "Room not found");
    const current = resolvePresets(row.presets);
    const change = applyPresetsAction(current, row.defaultPresetId, data, newPresetId);
    if (!change.ok) return json({ error: change.error, code: change.code }, change.status);
    // A schedule that pointed at a deleted preset falls back to the default.
    const schedule = scheduleBodySchema.shape.schedule.safeParse(row.schedule ?? null);
    const nextSchedule =
      schedule.success && schedule.data && schedule.data.presetId !== null && !change.presets.some((p) => p.id === schedule.data!.presetId)
        ? { ...schedule.data, presetId: null }
        : undefined;
    await tx
      .update(rooms)
      .set({
        presets: change.presets,
        defaultPresetId: change.defaultPresetId,
        ...(nextSchedule ? { schedule: nextSchedule } : {}),
      })
      .where(eq(rooms.id, roomId));
    return json({
      presets: change.presets,
      defaultPresetId: change.defaultPresetId ?? change.presets[0].id,
      ...(change.preset ? { preset: change.preset } : {}),
    });
  });
}

/** POST /api/rooms/:roomId/schedule (owner): `{schedule: RoomSchedule | null}`. */
export function updateRoomSchedule(request: Request, roomId: string) {
  return roomMutation(request, roomId, scheduleBodySchema, { ownerOnly: true }, async ({ tx, data }) => {
    const blocked = limited(roomId);
    if (blocked) return blocked;
    if (data.schedule?.presetId) {
      const row = await loadDefaultsRow(tx, roomId);
      const presets = resolvePresets(row?.presets ?? null);
      if (!presets.some((p) => p.id === data.schedule!.presetId)) {
        return jsonError(400, "Unknown preset", { presetId: "Unknown preset" });
      }
    }
    await tx.update(rooms).set({ schedule: data.schedule }).where(eq(rooms.id, roomId));
    return json({ schedule: data.schedule });
  });
}
