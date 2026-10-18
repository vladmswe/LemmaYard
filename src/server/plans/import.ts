// Room session → study plan (docs/specs/community.md §B.8, §C.11; AC-C-SP-6):
// "Save as study plan" on a finished session's results page creates a
// private plan "<room name> · <date>" with the session's problems in session
// order. Members only (others get the room's 404); a lobby, live or cancelled
// session → 409. Saving the same session again opens the plan made before.
// Lock order: only the user's plan lock (user-level); room tables are read
// without the room lock (finished sessions do not change their problems).
import { and, asc, eq } from "drizzle-orm";

import { importBodySchema } from "@/lib/plans/schemas";
import { formatShortDate } from "@/lib/format";
import { roomMembers, rooms, roomSessionProblems, roomSessions, studyPlanItems, studyPlans } from "@/server/db/schema";
import { jsonError } from "@/server/http/request";

import { json, planWrite, rateLimited } from "./http";
import { PLAN_LIMIT_MESSAGE, planLimitReached } from "./write";

export const SESSION_NOT_FOUND = "Session not found";
export const SESSION_NOT_FINISHED = "Only a finished session can be saved as a study plan";

/** "<room name> · Oct 17, 2026" (UTC date of the start; fits the 80-character title). */
export function sessionPlanTitle(roomName: string, startedAt: Date): string {
  return `${roomName} · ${formatShortDate(startedAt)}`;
}

/** POST /api/plans/import `{source: "room_session", sessionId}` → 201 `{id}` (200 `{id, existing: true}` when saved before). */
export function importPlan(request: Request) {
  return planWrite(request, importBodySchema, "import", async ({ tx, user, data }) => {
    const [session] = await tx
      .select({
        id: roomSessions.id,
        status: roomSessions.status,
        startedAt: roomSessions.startedAt,
        roomName: rooms.name,
      })
      .from(roomSessions)
      .innerJoin(rooms, eq(rooms.id, roomSessions.roomId))
      .innerJoin(roomMembers, and(eq(roomMembers.roomId, roomSessions.roomId), eq(roomMembers.userId, user.id)))
      .where(eq(roomSessions.id, data.sessionId))
      .limit(1);
    if (!session) return jsonError(404, SESSION_NOT_FOUND);
    if (session.status !== "finished" || session.startedAt === null) return jsonError(409, SESSION_NOT_FINISHED);

    const [existing] = await tx
      .select({ id: studyPlans.id })
      .from(studyPlans)
      .where(
        and(eq(studyPlans.ownerId, user.id), eq(studyPlans.source, "room_session"), eq(studyPlans.sourceId, session.id)),
      )
      .limit(1);
    if (existing) return json({ id: existing.id, existing: true });

    if (await planLimitReached(tx, user.id)) return jsonError(409, PLAN_LIMIT_MESSAGE);
    const limited = await rateLimited(tx, user.id, 2);
    if (limited) return limited;

    const slots = await tx
      .select({ problemId: roomSessionProblems.problemId })
      .from(roomSessionProblems)
      .where(eq(roomSessionProblems.sessionId, session.id))
      .orderBy(asc(roomSessionProblems.position));
    const [plan] = await tx
      .insert(studyPlans)
      .values({
        ownerId: user.id,
        title: sessionPlanTitle(session.roomName, session.startedAt),
        source: "room_session",
        sourceId: session.id,
        itemCount: slots.length,
      })
      .returning({ id: studyPlans.id });
    if (slots.length > 0) {
      await tx
        .insert(studyPlanItems)
        .values(slots.map((s, position) => ({ planId: plan.id, problemId: s.problemId, position })));
    }
    return json({ id: plan.id }, 201);
  });
}
