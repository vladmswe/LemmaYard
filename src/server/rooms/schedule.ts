// Weekly schedule reads (docs/specs/rooms-v2.md §5, §11, AC-V2-DEF-2..4):
// the Next-session plan of the room page and the rooms list, the room
// page's attendance strip, and GET /api/rooms/:roomId/schedule.ics.
// Nothing here writes: no cron, no rows, nothing starts by itself.
import { sql } from "drizzle-orm";
import type { NextResponse } from "next/server";

import type { AttendanceSession } from "@/lib/rooms/attendance";
import { buildScheduleIcs, icsFileName } from "@/lib/rooms/ics";
import { defaultPreset, roomDefaultsView, type RoomSchedule, type SessionTemplate } from "@/lib/rooms/room-defaults";
import { nextOccurrence } from "@/lib/rooms/schedule";
import { getCurrentUser } from "@/server/auth/session";
import { getDb, type Db } from "@/server/db";
import { getEnv } from "@/server/env";
import { jsonError } from "@/server/http/request";

import { requireRoomMember } from "./access";
import { roomNotFound, SIGN_IN_REQUIRED } from "./http";

/** Finished sessions per room that the attendance strip and "taken" occurrences look at. */
export const RECENT_SESSIONS = 8;

export type NextSessionPlan = {
  /** ISO instant of the occurrence. */
  at: string;
  schedule: RoomSchedule;
  /** The preset the lobby opens with (the schedule's, else the room default). */
  preset: SessionTemplate;
};

/** The schedule's next occurrence, skipping ones a finished session already used. */
export function planNextSession(
  room: { presets: SessionTemplate[]; defaultPresetId: string; schedule: RoomSchedule | null },
  taken: readonly (Date | string)[],
  now: Date,
): NextSessionPlan | null {
  if (!room.schedule) return null;
  const at = nextOccurrence(room.schedule, now, taken);
  const preset =
    (room.schedule.presetId ? room.presets.find((p) => p.id === room.schedule!.presetId) : undefined) ??
    defaultPreset(room.presets, room.defaultPresetId);
  return { at: at.toISOString(), schedule: room.schedule, preset };
}

export type RecentSession = AttendanceSession & { roomId: string; plannedFor: string | null; problemCount: number };

/** The last `RECENT_SESSIONS` finished sessions of each room, newest first, with their participants. */
export async function loadRecentSessions(db: Pick<Db, "execute">, roomIds: readonly string[]): Promise<RecentSession[]> {
  if (roomIds.length === 0) return [];
  const { rows } = await db.execute<{
    id: string;
    room_id: string;
    started_at: Date | string;
    planned_for: Date | string | null;
    problem_count: number;
    participant_ids: string[] | null;
  }>(sql`
    SELECT s.id, s.room_id, s.started_at, s.planned_for, s.problem_count,
      (SELECT array_agg(p.user_id) FROM room_session_participants p WHERE p.session_id = s.id) AS participant_ids
    FROM (
      SELECT id, room_id, started_at, planned_for, problem_count,
        row_number() OVER (PARTITION BY room_id ORDER BY started_at DESC, id) AS rn
      FROM room_sessions
      WHERE status = 'finished' AND started_at IS NOT NULL
        AND room_id IN (${sql.join(
          roomIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
    ) s
    WHERE s.rn <= ${RECENT_SESSIONS}
    ORDER BY s.room_id, s.started_at DESC
  `);
  const iso = (v: Date | string) => new Date(v).toISOString();
  return rows.map((r) => ({
    id: r.id,
    roomId: r.room_id,
    startedAt: iso(r.started_at),
    plannedFor: r.planned_for === null ? null : iso(r.planned_for),
    problemCount: Number(r.problem_count),
    participantIds: r.participant_ids ?? [],
  }));
}

/** Room page data of V2-2: the Next-session plan and the attendance sessions. Caller checked membership. */
export async function getRoomScheduleData(
  db: Db,
  room: { id: string; presets: SessionTemplate[]; defaultPresetId: string; schedule: RoomSchedule | null },
  now = new Date(),
): Promise<{ next: NextSessionPlan | null; recent: RecentSession[] }> {
  const recent = await loadRecentSessions(db, [room.id]);
  const taken = recent.flatMap((s) => (s.plannedFor ? [s.plannedFor] : []));
  return { next: planNextSession(room, taken, now), recent };
}

function uidHost(authUrl: string): string {
  try {
    return new URL(authUrl).hostname || "lemmayard";
  } catch {
    return "lemmayard";
  }
}

/**
 * GET /api/rooms/:roomId/schedule.ics (member only). 401 without a session;
 * the same 404 body for non-members, unknown ids and rooms without a schedule.
 */
export async function getScheduleIcs(roomId: string): Promise<NextResponse | Response> {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, SIGN_IN_REQUIRED);
  const db = getDb();
  const access = await requireRoomMember(db, roomId, user.id);
  if (!access) return roomNotFound();
  const { rows } = await db.execute<{
    description: string | null;
    color: number;
    presets: unknown;
    default_preset_id: string | null;
    schedule: unknown;
  }>(sql`SELECT description, color, presets, default_preset_id, schedule FROM rooms WHERE id = ${roomId}::uuid`);
  const row = rows[0];
  if (!row) return roomNotFound();
  const view = roomDefaultsView({
    description: row.description,
    color: Number(row.color),
    presets: row.presets,
    defaultPresetId: row.default_preset_id,
    schedule: row.schedule,
  });
  if (!view.schedule) return roomNotFound();
  const now = new Date();
  const recent = await loadRecentSessions(db, [roomId]);
  const plan = planNextSession(
    view,
    recent.flatMap((s) => (s.plannedFor ? [s.plannedFor] : [])),
    now,
  );
  if (!plan) return roomNotFound();
  const base = getEnv().AUTH_URL.replace(/\/+$/, "");
  const body = buildScheduleIcs({
    roomId,
    roomName: access.roomName,
    schedule: plan.schedule,
    firstOccurrence: new Date(plan.at),
    durationMin: plan.preset.durationMin,
    roomUrl: `${base}/rooms/${roomId}`,
    now,
    uidHost: uidHost(base),
  });
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFileName(access.roomName)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
