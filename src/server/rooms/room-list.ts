// Rooms list v2 (docs/specs/rooms-v2.md §2.5, §11 "GET /api/rooms + per
// room"): Q1 of v1 plus the profile, the Next-session plan, the last
// session (date and the viewer's per-problem chips; no "N of total") and
// the viewer's attendance and room rating. Sort: live → next session soonest
// → last activity. Four extra queries for the whole list, not per room.
import { sql } from "drizzle-orm";

import { attendanceShort, memberAttendance } from "@/lib/rooms/attendance";
import { isProvisional } from "@/lib/rooms/rating";
import { roomDefaultsView } from "@/lib/rooms/room-defaults";
import type { Db } from "@/server/db";

import { listMyRooms, type RoomListItem } from "./queries";
import { loadRecentSessions, planNextSession } from "./schedule";

/** One problem of the viewer's last session: ✓ solved, ✗ tried, · not attempted. */
export type LastSessionChip = { position: number; state: "solved" | "tried" | "none" };

export type RoomListItemV2 = RoomListItem & {
  description: string | null;
  color: number;
  next: { at: string; timeZone: string; presetName: string } | null;
  /** The latest finished session; `chips` null when the viewer did not take part. */
  last: { date: string; problemCount: number; chips: LastSessionChip[] | null } | null;
  you: { attendance: string | null; rating: number | null; provisional: boolean };
};

export function chipsFor(
  problemCount: number,
  cells: readonly { position: number; attempts: number; solveSeconds: number | null }[],
): LastSessionChip[] {
  const byPos = new Map(cells.map((c) => [c.position, c]));
  return Array.from({ length: problemCount }, (_, i) => {
    const c = byPos.get(i + 1);
    return { position: i + 1, state: c?.solveSeconds != null ? "solved" : c && c.attempts > 0 ? "tried" : "none" };
  });
}

/** Live first, then the soonest next session, then the most recent activity. */
export function sortRoomList<T extends Pick<RoomListItemV2, "openSession" | "next" | "lastSessionAt" | "joinedAt">>(rooms: T[]): T[] {
  const rank = (r: T) => (r.openSession?.status === "live" ? 0 : r.openSession?.status === "lobby" ? 1 : r.next ? 2 : 3);
  const activity = (r: T) => Date.parse(r.lastSessionAt ?? r.joinedAt);
  return [...rooms].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    if (a.next && b.next && a.next.at !== b.next.at) return Date.parse(a.next.at) - Date.parse(b.next.at);
    return activity(b) - activity(a);
  });
}

export async function listMyRoomsV2(db: Db, userId: string, now = new Date()): Promise<RoomListItemV2[]> {
  const base = await listMyRooms(db, userId);
  if (base.length === 0) return [];
  const ids = base.map((r) => r.id);
  const idList = sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const [profiles, recent, mine] = await Promise.all([
    db.execute<{
      id: string;
      description: string | null;
      color: number;
      presets: unknown;
      default_preset_id: string | null;
      schedule: unknown;
    }>(sql`SELECT id, description, color, presets, default_preset_id, schedule FROM rooms WHERE id IN (${idList})`),
    loadRecentSessions(db, ids),
    db.execute<{ room_id: string; rating: number | null; rated_pairs: number }>(
      sql`SELECT room_id, rating, rated_pairs FROM room_members WHERE user_id = ${userId}::uuid AND room_id IN (${idList})`,
    ),
  ]);
  const latest = new Map<string, (typeof recent)[number]>();
  for (const s of recent) if (!latest.has(s.roomId)) latest.set(s.roomId, s);
  const latestIds = [...latest.values()].map((s) => s.id);
  const cells =
    latestIds.length === 0
      ? { rows: [] as { session_id: string; position: number; attempts: number; solve_seconds: number | null }[] }
      : await db.execute<{ session_id: string; position: number; attempts: number; solve_seconds: number | null }>(sql`
          SELECT session_id, position, attempts, solve_seconds FROM room_session_results
          WHERE user_id = ${userId}::uuid AND session_id IN (${sql.join(
            latestIds.map((id) => sql`${id}::uuid`),
            sql`, `,
          )})`);

  const profileById = new Map(profiles.rows.map((p) => [p.id, p]));
  const mineById = new Map(mine.rows.map((m) => [m.room_id, m]));
  const items = base.map((room): RoomListItemV2 => {
    const p = profileById.get(room.id);
    const view = roomDefaultsView({
      description: p?.description ?? null,
      color: Number(p?.color ?? 0),
      presets: p?.presets ?? null,
      defaultPresetId: p?.default_preset_id ?? null,
      schedule: p?.schedule ?? null,
    });
    const sessions = recent.filter((s) => s.roomId === room.id);
    const plan = planNextSession(
      view,
      sessions.flatMap((s) => (s.plannedFor ? [s.plannedFor] : [])),
      now,
    );
    const last = latest.get(room.id);
    const played = last ? last.participantIds.includes(userId) : false;
    const lastCells = last
      ? cells.rows
          .filter((c) => c.session_id === last.id)
          .map((c) => ({ position: Number(c.position), attempts: Number(c.attempts), solveSeconds: c.solve_seconds }))
      : [];
    const m = mineById.get(room.id);
    return {
      ...room,
      description: view.description,
      color: view.color,
      next: plan ? { at: plan.at, timeZone: plan.schedule.timeZone, presetName: plan.preset.name } : null,
      last: last
        ? { date: last.startedAt, problemCount: last.problemCount, chips: played ? chipsFor(last.problemCount, lastCells) : null }
        : null,
      you: {
        attendance: attendanceShort(memberAttendance(userId, room.joinedAt, sessions)),
        rating: m?.rating ?? null,
        provisional: isProvisional(Number(m?.rated_pairs ?? 0)),
      },
    };
  });
  return sortRoomList(items);
}
