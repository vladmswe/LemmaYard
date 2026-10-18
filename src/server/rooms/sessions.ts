// Session lifecycle routes (docs/specs/rooms.md §2.5, §7.2, §7.3): create,
// draw, re-roll, re-roll all, pin/unpin, problem search, join, leave, start,
// end, cancel and the lobby view. Route handlers in
// src/app/api/rooms/[roomId]/sessions/** are one-line calls into this file.
//
// Check order (PLAN §6, spec §7.1): Content-Type/Origin 403 → 401 → body
// 413/400 → membership and session-in-room 404 (one body for every miss) →
// host/owner 403 → state 409 → rate 429 → write. Mutations run in one
// transaction holding the room lock, then the session lock (R2's order:
// user → room; this file: room → session; finalize: session only), and apply
// a due lazy close first.
import { and, asc, count, eq, gt, ilike, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { z } from "zod";

import { rerollAllByRating, rerollSlotByRating } from "@/lib/rooms/rating";
import { pinSlot, rerollAll, rerollSlot, unpinSlot, type DrawNotice, type Slot } from "@/lib/rooms/selection";
import {
  createSessionBodySchema,
  parseSlotPosition,
  pinBodySchema,
  PROBLEM_SEARCH_LIMIT,
  problemSearchQuerySchema,
  resolveSettings,
  SESSION_CREATES_PER_HOUR,
  sessionSettingsBodySchema,
  touchesDraw,
  type ResolvedSettings,
} from "@/lib/rooms/session-schemas";
import { canManageSession, transition } from "@/lib/rooms/session-state";
import {
  DUPLICATE_PROBLEM,
  drawErrorStatus,
  drawErrorView,
  END_INSTEAD,
  HOST_ONLY,
  REROLL_LIMIT,
  SESSION_ENDED,
  SESSION_NOT_FOUND,
  type DrawErrorView,
} from "@/lib/rooms/session-view";
import { JUDGE_DISABLED_SESSION_MESSAGE } from "@/lib/judge-availability";
import { emptyBodySchema } from "@/lib/rooms/schemas";
import { mixOf, selectionModeOf } from "@/lib/rooms/types";
import { getCurrentUser, type SessionUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { problems, roomSessionParticipants, roomSessionProblems, roomSessions } from "@/server/db/schema";
import { jsonError } from "@/server/http/request";
import { judgeDisabledResponse, judgeEnabled } from "@/server/judge";

import { requireRoomMember, requireSessionInRoom, type RoomAccess, type RoomSessionRow } from "./access";
import {
  buildLobbyView,
  drawAndSave,
  findPublishedProblem,
  loadDrawContext,
  loadSlots,
  toSlot,
  unknownTags,
  writeSlots,
} from "./draw";
import { loadSessionTemplate } from "./defaults";
import { appendRoomEvent, lockSession } from "./events";
import { json, readAuthedBody, roomNotFound, SIGN_IN_REQUIRED, tooMany } from "./http";
import { closeIfDue } from "./lifecycle";
import { recomputeSessionScores } from "./outcome";
import { lockRoom, type Tx } from "./queries";
import {
  applySessionRatings,
  ensureMemberRatings,
  loadSessionRatings,
  snapshotLateJoin,
  snapshotSessionStart,
} from "./ratings";
import { sessionRng } from "./rng";

export const SLOT_NOT_FOUND = "Slot not found";
export const NOT_IN_LOBBY = "The session has already started";

/** 404 with one body for unknown room, non-member, unknown or cross-room session (AC-S-SEC-1). */
export function sessionNotFound(): NextResponse {
  return jsonError(404, SESSION_NOT_FOUND);
}

/** 4xx with a machine-readable `code` next to the message. */
export function codedError(status: number, code: string, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, code, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

function drawErrorResponse(view: DrawErrorView): NextResponse {
  const { error, code, ...rest } = view;
  return codedError(drawErrorStatus(code), code, error, rest);
}

export type SessionContext<T> = {
  tx: Tx;
  user: SessionUser;
  access: RoomAccess;
  session: RoomSessionRow;
  canManage: boolean;
  data: T;
};

/**
 * A mutating route scoped to one session. Runs the handler in a transaction
 * holding the room lock and the session lock, after a due lazy close.
 */
export async function sessionMutation<T extends z.ZodType>(
  request: Request,
  roomId: string,
  sessionId: string,
  schema: T,
  options: { manage: boolean; requiresJudge?: boolean },
  handler: (ctx: SessionContext<z.infer<T>>) => Promise<NextResponse>,
): Promise<NextResponse> {
  const pre = await readAuthedBody(request, schema);
  if ("response" in pre) return pre.response;
  // Judge disabled (JUDGE_ENABLED): refuse before any lock or write.
  if (options.requiresJudge && !judgeEnabled()) return judgeDisabledResponse(JUDGE_DISABLED_SESSION_MESSAGE);
  const { user, data, db } = pre;
  // Cheap gate before any lock: non-members never wait on a room's lock.
  if (!(await requireRoomMember(db, roomId, user.id))) return sessionNotFound();

  return db.transaction(async (tx) => {
    await lockRoom(tx, roomId);
    const access = await requireRoomMember(tx, roomId, user.id);
    if (!access) return sessionNotFound();
    if (!(await requireSessionInRoom(tx, roomId, sessionId))) return sessionNotFound();
    await lockSession(tx, sessionId);
    await closeIfDue(tx, sessionId);
    const session = (await requireSessionInRoom(tx, roomId, sessionId))!;
    const canManage = canManageSession({ userId: user.id, role: access.role }, session);
    if (options.manage && !canManage) return jsonError(403, HOST_ONLY);
    return handler({ tx, user, access, session, canManage, data });
  });
}

function currentSettings(session: RoomSessionRow): ResolvedSettings {
  return {
    problemCount: session.problemCount,
    durationMin: session.durationMin,
    plannedFor: session.plannedFor,
    settings: session.settings,
    rated: session.rated,
  };
}

async function reload(tx: Tx, session: RoomSessionRow): Promise<RoomSessionRow> {
  return (await requireSessionInRoom(tx, session.roomId, session.id))!;
}

async function lobbyUpdated(tx: Tx, sessionId: string): Promise<void> {
  const [s] = await tx
    .select({ problemCount: roomSessions.problemCount, durationMin: roomSessions.durationMin })
    .from(roomSessions)
    .where(eq(roomSessions.id, sessionId));
  await appendRoomEvent(tx, sessionId, { type: "lobby_updated", payload: s });
}

function notInLobby(session: RoomSessionRow): NextResponse {
  return codedError(409, "not_lobby", session.status === "live" ? NOT_IN_LOBBY : SESSION_ENDED);
}

/** Settings stored in the session row after a pin or re-roll changed the actual mix. */
async function syncActualMix(tx: Tx, session: RoomSessionRow): Promise<void> {
  const slots = await loadSlots(tx, session.id);
  if (slots.length !== session.problemCount) return;
  await tx
    .update(roomSessions)
    .set({ settings: { ...session.settings, mix: mixOf(slots) } })
    .where(eq(roomSessions.id, session.id));
}

async function lobbyResponse(
  tx: Tx,
  session: RoomSessionRow,
  canManage: boolean,
  extra: Parameters<typeof buildLobbyView>[3] = {},
  status = 200,
): Promise<NextResponse> {
  const fresh = await reload(tx, session);
  return json({ lobby: await buildLobbyView(tx, fresh, canManage, extra) }, status);
}

// --- POST /api/rooms/:roomId/sessions -------------------------------------

export async function createSession(request: Request, roomId: string): Promise<NextResponse> {
  const pre = await readAuthedBody(request, createSessionBodySchema);
  if ("response" in pre) return pre.response;
  const { user, data, db } = pre;
  if (!(await requireRoomMember(db, roomId, user.id))) return roomNotFound();
  const { presetId, ...body } = data;

  return db.transaction(async (tx) => {
    await lockRoom(tx, roomId);
    if (!(await requireRoomMember(tx, roomId, user.id))) return roomNotFound();
    // v2 §4: the room's default preset (or `presetId`); explicit fields override it.
    const template = await loadSessionTemplate(tx, roomId, presetId);
    if (!template) return jsonError(400, "Unknown preset", { presetId: "Unknown preset" });
    const resolved = resolveSettings(null, body, new Date(), template);
    if ("error" in resolved) return jsonError(400, resolved.error, { [resolved.field]: resolved.error });
    const unknown = await unknownTags(tx, resolved.settings.tags);
    if (unknown.length > 0) return jsonError(400, "Unknown topic", { tags: `Unknown topic: ${unknown[0]}` });

    const [open] = await tx
      .select({ id: roomSessions.id })
      .from(roomSessions)
      .where(and(eq(roomSessions.roomId, roomId), sql`${roomSessions.status} IN ('lobby', 'live')`))
      .limit(1);
    if (open && (await closeIfDue(tx, open.id)) === null) {
      return codedError(409, "session_open", "This room already has an open session", { sessionId: open.id });
    }
    const [recent] = await tx
      .select({
        count: count(),
        retryAfterSec: sql<number | null>`ceil(extract(epoch from (min(${roomSessions.createdAt}) + interval '1 hour' - now())))::int`,
      })
      .from(roomSessions)
      .where(and(eq(roomSessions.roomId, roomId), gt(roomSessions.createdAt, sql`now() - interval '1 hour'`)));
    if (recent.count >= SESSION_CREATES_PER_HOUR) {
      const retryAfterSec = Math.min(3600, Math.max(1, recent.retryAfterSec ?? 60));
      return tooMany("Too many sessions were created in this room recently. Try again later.", retryAfterSec);
    }

    const [session] = await tx
      .insert(roomSessions)
      .values({
        roomId,
        hostId: user.id,
        problemCount: resolved.problemCount,
        durationMin: resolved.durationMin,
        plannedFor: resolved.plannedFor,
        settings: resolved.settings,
        rated: resolved.rated,
      })
      .returning();
    await lockSession(tx, session.id);
    await tx.insert(roomSessionParticipants).values({ sessionId: session.id, userId: user.id });
    await ensureMemberRatings(tx, roomId, [user.id]);
    await appendRoomEvent(tx, session.id, { type: "participant_joined", actorUserId: user.id, payload: {} });

    const drawn = await drawAndSave(tx, session, resolved, sessionRng());
    const extra = drawn.ok
      ? { notices: drawn.notices }
      : { drawError: drawErrorView(drawn, resolved.problemCount, resolved.settings.tags.length) };
    await lobbyUpdated(tx, session.id);
    const fresh = await reload(tx, session);
    return json({ id: session.id, lobby: await buildLobbyView(tx, fresh, true, extra) }, 201);
  });
}

// --- Lobby: draw, re-roll, pin --------------------------------------------

export function drawSession(request: Request, roomId: string, sessionId: string) {
  return sessionMutation(
    request,
    roomId,
    sessionId,
    sessionSettingsBodySchema,
    { manage: true },
    async ({ tx, session, canManage, data }) => {
      if (session.status !== "lobby") return notInLobby(session);
      const resolved = resolveSettings(currentSettings(session), data, new Date());
      if ("error" in resolved) return jsonError(400, resolved.error, { [resolved.field]: resolved.error });
      const unknown = await unknownTags(tx, resolved.settings.tags);
      if (unknown.length > 0) return jsonError(400, "Unknown topic", { tags: `Unknown topic: ${unknown[0]}` });

      const slots = await loadSlots(tx, session.id);
      let notices: DrawNotice[] = [];
      if (touchesDraw(data) || slots.length !== resolved.problemCount) {
        const drawn = await drawAndSave(tx, session, resolved, sessionRng());
        if (!drawn.ok) {
          return drawErrorResponse(drawErrorView(drawn, resolved.problemCount, resolved.settings.tags.length));
        }
        notices = drawn.notices;
      } else {
        await tx
          .update(roomSessions)
          .set({ durationMin: resolved.durationMin, plannedFor: resolved.plannedFor, rated: resolved.rated })
          .where(eq(roomSessions.id, session.id));
      }
      await lobbyUpdated(tx, session.id);
      return lobbyResponse(tx, session, canManage, { notices });
    },
  );
}

async function slotContext(
  tx: Tx,
  session: RoomSessionRow,
  rawPosition: string,
): Promise<{ response: NextResponse } | { position: number; slots: Slot[] }> {
  const position = parseSlotPosition(rawPosition);
  if (position === null || position > session.problemCount) return { response: jsonError(404, SLOT_NOT_FOUND) };
  const slots = await loadSlots(tx, session.id);
  return { position, slots: slots.map(toSlot) };
}

export function rerollSessionSlot(request: Request, roomId: string, sessionId: string, rawPosition: string) {
  return sessionMutation(
    request,
    roomId,
    sessionId,
    emptyBodySchema,
    { manage: true },
    async ({ tx, session, canManage }) => {
      const ctxSlots = await slotContext(tx, session, rawPosition);
      if ("response" in ctxSlots) return ctxSlots.response;
      if (session.status !== "lobby") return notInLobby(session);
      const { position, slots } = ctxSlots;
      if (!slots.some((s) => s.position === position)) {
        return codedError(409, "slot_empty", "Draw the problems first");
      }
      const ctx = await loadDrawContext(tx, session, session.settings.tags);
      const common = {
        position,
        pool: ctx.pool,
        rerolledIds: session.rerolledProblemIds,
        rerollCount: session.rerollCount,
        avoidSolved: session.settings.avoidSolved,
        rng: sessionRng(),
      };
      // v2: in rating mode a re-roll searches around the slot's target instead of its difficulty.
      const result =
        selectionModeOf(session.settings) === "rating"
          ? rerollSlotByRating({
              ...common,
              slots: (await loadSlots(tx, session.id)).map((s) => ({ ...toSlot(s), rating: s.rating })),
              target: session.settings.targets?.[position - 1] ?? null,
            })
          : rerollSlot({ ...common, slots });
      if (!result.ok) {
        if ("counts" in result) {
          return drawErrorResponse(drawErrorView(result, session.problemCount, session.settings.tags.length));
        }
        switch (result.code) {
          case "reroll_limit":
            return codedError(409, "reroll_limit", REROLL_LIMIT);
          case "slot_pinned":
            return codedError(409, "slot_pinned", "Unpin this problem first");
          case "no_candidates":
            return codedError(409, "no_candidates", "No other problem of this difficulty matches the topics");
          default:
            return jsonError(404, SLOT_NOT_FOUND);
        }
      }
      const chosen = result.slots.find((s) => s.position === position)!;
      await tx
        .update(roomSessionProblems)
        .set({ problemId: chosen.problemId, difficulty: chosen.difficulty })
        .where(and(eq(roomSessionProblems.sessionId, session.id), eq(roomSessionProblems.position, position)));
      await tx
        .update(roomSessions)
        .set({ rerolledProblemIds: result.rerolledIds, rerollCount: result.rerollCount })
        .where(eq(roomSessions.id, session.id));
      // Any difficulty may fill a rating-mode slot, so the stored mix follows the slots.
      if (selectionModeOf(session.settings) === "rating") await syncActualMix(tx, session);
      await lobbyUpdated(tx, session.id);
      return lobbyResponse(tx, session, canManage, { notices: result.notices });
    },
  );
}

export function rerollAllSlots(request: Request, roomId: string, sessionId: string) {
  return sessionMutation(
    request,
    roomId,
    sessionId,
    emptyBodySchema,
    { manage: true },
    async ({ tx, session, canManage }) => {
      if (session.status !== "lobby") return notInLobby(session);
      const mode = selectionModeOf(session.settings);
      if (mode === "manual") return codedError(409, "manual_mode", "Pick the problems yourself in this mode");
      const rows = await loadSlots(tx, session.id);
      const slots = rows.map(toSlot);
      const ctx = await loadDrawContext(tx, session, session.settings.tags);
      const common = {
        problemCount: session.problemCount,
        pool: ctx.pool,
        rerolledIds: session.rerolledProblemIds,
        rerollCount: session.rerollCount,
        avoidSolved: session.settings.avoidSolved,
        rng: sessionRng(),
      };
      const result =
        mode === "rating"
          ? rerollAllByRating({
              ...common,
              slots: rows.map((s) => ({ ...toSlot(s), rating: s.rating })),
              ratings: [...(await ensureMemberRatings(tx, session.roomId, ctx.expectedUserIds)).values()].map((r) => r.rating),
              challenge: session.settings.challenge,
            })
          : rerollAll({ ...common, mix: session.settings.mix, slots });
      if (!result.ok) {
        if (result.code === "reroll_limit") return codedError(409, "reroll_limit", REROLL_LIMIT);
        if ("counts" in result) {
          return drawErrorResponse(drawErrorView(result, session.problemCount, session.settings.tags.length));
        }
        return codedError(409, result.code, "Re-roll failed");
      }
      await writeSlots(tx, session.id, result.slots);
      const targets = "targetsByPosition" in result ? (result.targetsByPosition as (number | null)[]) : null;
      await tx
        .update(roomSessions)
        .set({
          rerolledProblemIds: result.rerolledIds,
          rerollCount: result.rerollCount,
          ...(targets ? { settings: { ...session.settings, mix: mixOf(result.slots), targets } } : {}),
        })
        .where(eq(roomSessions.id, session.id));
      await lobbyUpdated(tx, session.id);
      return lobbyResponse(tx, session, canManage, { notices: result.notices });
    },
  );
}

export function pinSessionSlot(request: Request, roomId: string, sessionId: string, rawPosition: string) {
  return sessionMutation(
    request,
    roomId,
    sessionId,
    pinBodySchema,
    { manage: true },
    async ({ tx, session, canManage, data }) => {
      const ctxSlots = await slotContext(tx, session, rawPosition);
      if ("response" in ctxSlots) return ctxSlots.response;
      if (session.status !== "lobby") return notInLobby(session);
      const { position, slots } = ctxSlots;
      const existing = slots.find((s) => s.position === position);

      if ("unpin" in data) {
        if (!existing) return jsonError(404, SLOT_NOT_FOUND);
        const r = unpinSlot(slots, position);
        if (!r.ok) return jsonError(404, SLOT_NOT_FOUND);
        await tx
          .update(roomSessionProblems)
          .set({ pinned: false })
          .where(and(eq(roomSessionProblems.sessionId, session.id), eq(roomSessionProblems.position, position)));
      } else {
        const problem = await findPublishedProblem(tx, data.slug);
        if (!problem) return jsonError(404, "Problem not found");
        if (existing) {
          const r = pinSlot(slots, position, problem);
          if (!r.ok) {
            return r.code === "duplicate_problem"
              ? codedError(409, "duplicate_problem", DUPLICATE_PROBLEM)
              : jsonError(404, SLOT_NOT_FOUND);
          }
          await tx
            .update(roomSessionProblems)
            .set({ problemId: problem.id, difficulty: problem.difficulty, pinned: true })
            .where(and(eq(roomSessionProblems.sessionId, session.id), eq(roomSessionProblems.position, position)));
        } else {
          if (slots.some((s) => s.problemId === problem.id)) {
            return codedError(409, "duplicate_problem", DUPLICATE_PROBLEM);
          }
          await tx.insert(roomSessionProblems).values({
            sessionId: session.id,
            position,
            problemId: problem.id,
            difficulty: problem.difficulty,
            pinned: true,
          });
        }
      }
      await syncActualMix(tx, session);
      await lobbyUpdated(tx, session.id);
      return lobbyResponse(tx, session, canManage);
    },
  );
}

// --- Join / leave ---------------------------------------------------------

export function joinSession(request: Request, roomId: string, sessionId: string) {
  return sessionMutation(
    request,
    roomId,
    sessionId,
    emptyBodySchema,
    { manage: false },
    async ({ tx, user, session }) => {
      if (session.status !== "lobby" && session.status !== "live") {
        return codedError(409, "session_ended", SESSION_ENDED);
      }
      const inserted = await tx
        .insert(roomSessionParticipants)
        .values({ sessionId: session.id, userId: user.id })
        .onConflictDoNothing()
        .returning({ userId: roomSessionParticipants.userId });
      if (inserted.length === 1) {
        await appendRoomEvent(tx, session.id, { type: "participant_joined", actorUserId: user.id, payload: {} });
        if (session.status === "live") {
          await recomputeSessionScores(tx, session.id);
          // v2 §6.6: a late joiner's start rating is the one at join time.
          await snapshotLateJoin(tx, session, user.id);
        } else {
          await ensureMemberRatings(tx, session.roomId, [user.id]);
        }
      }
      return json({ joined: true, status: session.status });
    },
  );
}

/**
 * Not in the spec's endpoint list: leaving is allowed in the lobby only
 * (a live participant's score stays). The host always stays.
 */
export function leaveSession(request: Request, roomId: string, sessionId: string) {
  return sessionMutation(
    request,
    roomId,
    sessionId,
    emptyBodySchema,
    { manage: false },
    async ({ tx, user, session }) => {
      if (session.status !== "lobby") {
        return codedError(409, "not_lobby", "You can leave a session only before it starts");
      }
      if (session.hostId === user.id) return codedError(409, "host_stays", "The host stays in the session");
      const deleted = await tx
        .delete(roomSessionParticipants)
        .where(and(eq(roomSessionParticipants.sessionId, session.id), eq(roomSessionParticipants.userId, user.id)))
        .returning({ userId: roomSessionParticipants.userId });
      if (deleted.length === 1) await lobbyUpdated(tx, session.id);
      return json({ joined: false });
    },
  );
}

// --- Start / end / cancel -------------------------------------------------

export function startSession(request: Request, roomId: string, sessionId: string) {
  return sessionMutation(
    request,
    roomId,
    sessionId,
    emptyBodySchema,
    // A live session nobody can submit to would only run out: no start without a judge.
    { manage: true, requiresJudge: true },
    async ({ tx, session }) => {
      const t = transition(session.status, "start");
      if (!t.ok || !t.changed) return notInLobby(session);
      const slots = await loadSlots(tx, session.id);
      if (slots.length !== session.problemCount) {
        return codedError(409, "slots_incomplete", "Fill every problem slot first");
      }
      const gone = slots.find((s) => !s.published);
      if (gone) {
        return codedError(409, "slot_unavailable", `Problem ${gone.position} is no longer available; re-roll it`, {
          position: gone.position,
        });
      }
      const [{ participants }] = await tx
        .select({ participants: count() })
        .from(roomSessionParticipants)
        .where(eq(roomSessionParticipants.sessionId, session.id));
      if (participants === 0) return codedError(409, "no_participants", "At least one participant must join first");

      const { rows } = await tx.execute<{ started_at: string; ends_at: string }>(sql`
        UPDATE room_sessions AS s
        SET status = 'live', started_at = c.t, ends_at = c.t + make_interval(mins => s.duration_min::int)
        FROM (SELECT clock_timestamp() AS t) AS c
        WHERE s.id = ${session.id} AND s.status = 'lobby'
        RETURNING s.started_at, s.ends_at
      `);
      const startedAt = new Date(rows[0].started_at).toISOString();
      const endsAt = new Date(rows[0].ends_at).toISOString();
      // v2 §6.2: every P and Δ later uses the ratings at start.
      await snapshotSessionStart(tx, session);
      await recomputeSessionScores(tx, session.id);
      await appendRoomEvent(tx, session.id, { type: "session_started", payload: { startedAt, endsAt } });
      return json({ startedAt, endsAt });
    },
  );
}

export function endSession(request: Request, roomId: string, sessionId: string) {
  return sessionMutation(
    request,
    roomId,
    sessionId,
    emptyBodySchema,
    { manage: true },
    async ({ tx, session }) => {
      const t = transition(session.status, "end");
      if (!t.ok) {
        return codedError(409, "not_live", session.status === "lobby" ? "The session has not started; cancel it instead" : SESSION_ENDED);
      }
      if (!t.changed) {
        return json({ endedAt: session.endedAt!.toISOString(), endReason: session.endReason });
      }
      const [row] = await tx
        .update(roomSessions)
        .set({ status: "finished", endedAt: sql`clock_timestamp()`, endReason: "host" })
        .where(and(eq(roomSessions.id, session.id), eq(roomSessions.status, "live")))
        .returning({ endedAt: roomSessions.endedAt });
      const endedAt = row.endedAt!.toISOString();
      await recomputeSessionScores(tx, session.id);
      await appendRoomEvent(tx, session.id, { type: "session_ended", payload: { endedAt, reason: "host" } });
      await applySessionRatings(tx, session.id);
      return json({ endedAt, endReason: "host" });
    },
  );
}

export function cancelSession(request: Request, roomId: string, sessionId: string) {
  return sessionMutation(
    request,
    roomId,
    sessionId,
    emptyBodySchema,
    { manage: true },
    async ({ tx, session }) => {
      const t = transition(session.status, "cancel");
      if (!t.ok) {
        return t.code === "end_instead"
          ? codedError(409, "end_instead", END_INSTEAD)
          : codedError(409, "not_lobby", SESSION_ENDED);
      }
      await tx
        .update(roomSessions)
        .set({ status: "cancelled", endedAt: sql`clock_timestamp()`, endReason: "cancelled" })
        .where(and(eq(roomSessions.id, session.id), eq(roomSessions.status, "lobby")));
      await appendRoomEvent(tx, session.id, { type: "session_cancelled", payload: {} });
      return json({ cancelled: true });
    },
  );
}

// --- GET routes -----------------------------------------------------------

/** Member + session-in-room gate for GET routes, with a due lazy close. */
async function sessionRead<T>(
  roomId: string,
  sessionId: string,
  handler: (ctx: { tx: Tx; user: SessionUser; access: RoomAccess; session: RoomSessionRow; canManage: boolean }) => Promise<T>,
): Promise<NextResponse | T> {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, SIGN_IN_REQUIRED);
  const db = getDb();
  const access = await requireRoomMember(db, roomId, user.id);
  if (!access) return sessionNotFound();
  const found = await requireSessionInRoom(db, roomId, sessionId);
  if (!found) return sessionNotFound();
  return db.transaction(async (tx) => {
    let session = found;
    if (session.status === "lobby" || session.status === "live") {
      if (await closeIfDue(tx, sessionId)) session = await reload(tx, session);
    }
    const canManage = canManageSession({ userId: user.id, role: access.role }, session);
    return handler({ tx, user, access, session, canManage });
  });
}

/** GET …/lobby: the lobby view (titles and draw notes for the host/owner only). */
export async function getLobby(roomId: string, sessionId: string): Promise<NextResponse> {
  return sessionRead(roomId, sessionId, async ({ tx, session, canManage }) =>
    json({ lobby: await buildLobbyView(tx, session, canManage) }),
  );
}

/**
 * GET …/ratings (v2 §11, D3): the session's rating ledger, for members of
 * the room only (everyone else gets the uniform 404).
 */
export async function getSessionRatings(roomId: string, sessionId: string): Promise<NextResponse> {
  return sessionRead(roomId, sessionId, async ({ tx, session }) => {
    const view = await loadSessionRatings(tx, session.id);
    return view ? json(view) : sessionNotFound();
  });
}

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** GET …/problem-search?q=: published problems by title, for pins (host/owner). */
export async function searchProblems(request: Request, roomId: string, sessionId: string): Promise<NextResponse> {
  return sessionRead(roomId, sessionId, async ({ tx, canManage }) => {
    if (!canManage) return jsonError(403, HOST_ONLY);
    const q = problemSearchQuerySchema.safeParse(new URL(request.url).searchParams.get("q") ?? "");
    if (!q.success) return jsonError(400, q.error.issues[0].message, { q: q.error.issues[0].message });
    const rows = await tx
      .select({
        slug: problems.slug,
        title: problems.title,
        difficulty: problems.difficulty,
        tags: sql<string[]>`coalesce((
          SELECT array_agg(t.slug ORDER BY t.slug) FROM problem_tags pt JOIN tags t ON t.id = pt.tag_id
          WHERE pt.problem_id = "problems"."id"), '{}')`,
      })
      .from(problems)
      .where(and(eq(problems.published, true), ilike(problems.title, `%${escapeLike(q.data)}%`)))
      .orderBy(asc(problems.number))
      .limit(PROBLEM_SEARCH_LIMIT);
    return json(rows);
  });
}
