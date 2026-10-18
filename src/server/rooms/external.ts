// LeetCode problems in rooms (docs/specs/rooms-external-problems.md): the
// room's LeetCode list (owner writes, members read), LeetCode slots in the
// lobby (host/owner) and self-reported solves while live (participants). No
// request to leetcode.com is ever made: a LeetCode problem is a slug.
//
// Check order as in sessions.ts (Origin/Content-Type 403 → 401 → body
// 413/400 → membership 404 → role 403 → state 409 → rate 429 → write); writes
// hold the room lock, then the session lock `rs:<id>`.
import { and, asc, count, eq, gt, lt, sql } from "drizzle-orm";
import type { NextResponse } from "next/server";
import {
  bankBodySchema,
  MAX_BANK_ENTRIES,
  normalizeExternalInput,
  resolveExternalTitle,
  selfReportBodySchema,
  sessionExternalBodySchema,
  type BankEntry,
  type BankView,
} from "@/lib/rooms/external";
import { parseSlotPosition } from "@/lib/rooms/session-schemas";
import { JOIN_FIRST, SESSION_ENDED } from "@/lib/rooms/session-view";
import { externalCountOf, MAX_PROBLEM_COUNT } from "@/lib/rooms/types";
import { getCurrentUser } from "@/server/auth/session";
import { getDb, type Db } from "@/server/db";
import {
  roomExternalProblems,
  roomSessionParticipants,
  roomSessionProblems,
  roomSessionResults,
  roomSessions,
} from "@/server/db/schema";
import { jsonError } from "@/server/http/request";
import { createRateLimiter } from "@/server/http/rate-limit";

import { requireRoomMember } from "./access";
import { roomSettingsLimiter } from "./defaults";
import { externalSlotValues, loadExternalSlots, type ExternalSlotRow } from "./draw";
import { appendRoomEvent } from "./events";
import { json, OWNER_ONLY, roomMutation, roomNotFound, SIGN_IN_REQUIRED, tooMany } from "./http";
import { recomputeSessionScores } from "./outcome";
import type { Tx } from "./queries";
import { codedError, lobbyResponse, lobbyUpdated, notInLobby, sessionMutation, SLOT_NOT_FOUND } from "./sessions";

/** LeetCode slot changes per session (in-process, soft; hygiene only). */
export const lobbyExternalLimiter = createRateLimiter({ limit: 60, windowMs: 10 * 60_000 });
/** Self-reported marks per user (in-process, soft). */
export const selfReportLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

export const BANK_DUPLICATE = "This problem is already in the room's LeetCode list";
export const BANK_FULL = `A room keeps at most ${MAX_BANK_ENTRIES} LeetCode problems. Remove one first.`;
export const BANK_NOT_FOUND = "LeetCode problem not found";
export const SESSION_DUPLICATE = "This LeetCode problem is already in the session";
export const SESSION_FULL = `A session has at most ${MAX_PROBLEM_COUNT} problems`;
export const JUDGED_SLOT = "Our judge checks this problem: submit your code instead";

type Executor = Pick<Db, "select">;

function toEntry(r: typeof roomExternalProblems.$inferSelect): BankEntry {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    difficulty: r.difficulty,
    rating: r.rating,
    createdAt: r.createdAt.toISOString(),
  };
}

/** The room's LeetCode list, oldest first. The caller has checked membership. */
export async function listBank(db: Executor, roomId: string): Promise<BankEntry[]> {
  const rows = await db
    .select()
    .from(roomExternalProblems)
    .where(eq(roomExternalProblems.roomId, roomId))
    .orderBy(asc(roomExternalProblems.createdAt), asc(roomExternalProblems.id));
  return rows.map(toEntry);
}

/** Room page / GET: the list for a member, or null (404) for anyone else. */
export async function getBankView(db: Db, roomId: string, userId: string): Promise<BankView | null> {
  const access = await requireRoomMember(db, roomId, userId);
  if (!access) return null;
  return { problems: await listBank(db, roomId), canEdit: access.role === "owner" };
}

/** GET /api/rooms/:roomId/external-problems (member). */
export async function getBank(roomId: string): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, SIGN_IN_REQUIRED);
  const view = await getBankView(getDb(), roomId, user.id);
  return view ? json(view) : roomNotFound();
}

async function bankCount(tx: Tx, roomId: string): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(roomExternalProblems)
    .where(eq(roomExternalProblems.roomId, roomId));
  return row?.n ?? 0;
}

async function findBySlug(tx: Tx, roomId: string, slug: string) {
  const [row] = await tx
    .select()
    .from(roomExternalProblems)
    .where(and(eq(roomExternalProblems.roomId, roomId), eq(roomExternalProblems.slug, slug)))
    .limit(1);
  return row ?? null;
}

/** POST /api/rooms/:roomId/external-problems (owner): add / update / delete. */
export function updateBank(request: Request, roomId: string) {
  return roomMutation(request, roomId, bankBodySchema, { ownerOnly: true }, async ({ tx, user, data }) => {
    const limited = roomSettingsLimiter.hit(roomId);
    if (!limited.ok) return tooMany("Too many changes to this room. Try again later.", limited.retryAfterSec);

    if (data.action === "add") {
      const values = normalizeExternalInput(data);
      if ((await bankCount(tx, roomId)) >= MAX_BANK_ENTRIES) return codedError(409, "bank_full", BANK_FULL);
      const inserted = await tx
        .insert(roomExternalProblems)
        .values({ roomId, addedBy: user.id, ...values })
        .onConflictDoNothing()
        .returning();
      if (inserted.length === 0) return codedError(409, "duplicate", BANK_DUPLICATE);
      return json({ problems: await listBank(tx, roomId), entry: toEntry(inserted[0]) }, 201);
    }

    const [entry] = await tx
      .select()
      .from(roomExternalProblems)
      .where(and(eq(roomExternalProblems.id, data.id), eq(roomExternalProblems.roomId, roomId)))
      .limit(1);
    if (!entry) return jsonError(404, BANK_NOT_FOUND);

    if (data.action === "delete") {
      // Session slots keep their snapshot; their link back is set to NULL by the FK.
      await tx.delete(roomExternalProblems).where(eq(roomExternalProblems.id, entry.id));
      return json({ problems: await listBank(tx, roomId) });
    }

    const slug = data.url !== undefined ? normalizeExternalInput({ url: data.url }).slug : entry.slug;
    if (slug !== entry.slug) {
      const other = await findBySlug(tx, roomId, slug);
      if (other) return codedError(409, "duplicate", BANK_DUPLICATE);
    }
    const title =
      data.title !== undefined
        ? resolveExternalTitle(slug, data.title)
        : entry.title;
    const [updated] = await tx
      .update(roomExternalProblems)
      .set({
        slug,
        title,
        ...(data.difficulty !== undefined ? { difficulty: data.difficulty } : {}),
        ...(data.rating !== undefined ? { rating: data.rating } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(roomExternalProblems.id, entry.id))
      .returning();
    return json({ problems: await listBank(tx, roomId), entry: toEntry(updated) });
  });
}

// --- Lobby: LeetCode slots ---------------------------------------------------

async function setSessionShape(tx: Tx, sessionId: string, problemCount: number, external: number) {
  const [row] = await tx.select({ settings: roomSessions.settings }).from(roomSessions).where(eq(roomSessions.id, sessionId));
  const { external: _old, ...rest } = row.settings;
  void _old;
  await tx
    .update(roomSessions)
    .set({ problemCount, settings: external > 0 ? { ...rest, external } : rest })
    .where(eq(roomSessions.id, sessionId));
}

/** Rewrites the LeetCode slots at `positions` (they stay last; internal rows are untouched). */
async function rewriteExternals(tx: Tx, sessionId: string, slots: readonly ExternalSlotRow[]) {
  await tx
    .delete(roomSessionProblems)
    .where(and(eq(roomSessionProblems.sessionId, sessionId), sql`${roomSessionProblems.problemId} IS NULL`));
  if (slots.length === 0) return;
  await tx.insert(roomSessionProblems).values(slots.map((s) => externalSlotValues(sessionId, s.position, s)));
}

/**
 * POST …/sessions/:sid/external (host/owner, lobby): add a LeetCode slot from
 * the room list or a pasted link (optionally saved to the list, owner only),
 * or remove one. Adding fills the first empty LeetCode slot, else appends one.
 */
export function updateSessionExternal(request: Request, roomId: string, sessionId: string) {
  return sessionMutation(
    request,
    roomId,
    sessionId,
    sessionExternalBodySchema,
    { manage: true },
    async ({ tx, user, access, session, canManage, data }) => {
      if (session.status !== "lobby") return notInLobby(session);
      if ("saveToBank" in data && data.saveToBank && access.role !== "owner") return jsonError(403, OWNER_ONLY);
      const limited = lobbyExternalLimiter.hit(session.id);
      if (!limited.ok) return tooMany("Too many changes to this lobby. Try again later.", limited.retryAfterSec);

      const externals = await loadExternalSlots(tx, session.id);
      const external = externalCountOf(session.settings);
      const drawn = session.problemCount - external;

      if (data.action === "remove") {
        const position = data.position;
        if (position > session.problemCount) return jsonError(404, SLOT_NOT_FOUND);
        if (position <= drawn) return codedError(409, "judged_slot", "Only LeetCode problems can be removed here");
        if (session.problemCount <= 1) return codedError(409, "last_slot", "A session needs at least one problem");
        // Later LeetCode slots move up by one; the session gets one slot shorter.
        const next = externals
          .filter((e) => e.position !== position)
          .map((e) => (e.position > position ? { ...e, position: e.position - 1 } : e));
        await rewriteExternals(tx, session.id, next);
        await setSessionShape(tx, session.id, session.problemCount - 1, external - 1);
        await lobbyUpdated(tx, session.id);
        return lobbyResponse(tx, session, canManage);
      }

      // add: from the room list, or a pasted link
      let values: Omit<ExternalSlotRow, "position">;
      if ("bankId" in data) {
        const [entry] = await tx
          .select()
          .from(roomExternalProblems)
          .where(and(eq(roomExternalProblems.id, data.bankId), eq(roomExternalProblems.roomId, roomId)))
          .limit(1);
        if (!entry) return jsonError(404, BANK_NOT_FOUND);
        values = { slug: entry.slug, title: entry.title, difficulty: entry.difficulty, rating: entry.rating, bankId: entry.id };
      } else {
        const typed = normalizeExternalInput(data);
        let bankId: string | null = null;
        if (data.saveToBank) {
          const existing = await findBySlug(tx, roomId, typed.slug);
          if (existing) {
            bankId = existing.id;
          } else {
            if ((await bankCount(tx, roomId)) >= MAX_BANK_ENTRIES) return codedError(409, "bank_full", BANK_FULL);
            const [row] = await tx
              .insert(roomExternalProblems)
              .values({ roomId, addedBy: user.id, ...typed })
              .returning({ id: roomExternalProblems.id });
            bankId = row.id;
          }
        }
        values = { ...typed, bankId };
      }
      if (externals.some((e) => e.slug === values.slug)) return codedError(409, "duplicate", SESSION_DUPLICATE);

      const taken = new Set(externals.map((e) => e.position));
      let position: number | null = null;
      for (let p = drawn + 1; p <= session.problemCount; p++) {
        if (!taken.has(p)) {
          position = p;
          break;
        }
      }
      if (position === null) {
        if (session.problemCount >= MAX_PROBLEM_COUNT) return codedError(409, "session_full", SESSION_FULL);
        position = session.problemCount + 1;
        await setSessionShape(tx, session.id, session.problemCount + 1, external + 1);
      }
      await tx.insert(roomSessionProblems).values(externalSlotValues(session.id, position, values));
      await lobbyUpdated(tx, session.id);
      return lobbyResponse(tx, session, canManage);
    },
  );
}

// --- Live: self-reported solves -------------------------------------------------

/**
 * POST …/slots/:position/self-report (participant, live): `{solved: true}`
 * marks the viewer's own LeetCode slot solved at the server's time since the
 * start; `{solved: false}` takes it back. Scored like a judged solve.
 */
export function selfReport(request: Request, roomId: string, sessionId: string, rawPosition: string) {
  return sessionMutation(
    request,
    roomId,
    sessionId,
    selfReportBodySchema,
    { manage: false },
    async ({ tx, user, session, data }) => {
      const position = parseSlotPosition(rawPosition);
      if (position === null || position > session.problemCount) return jsonError(404, SLOT_NOT_FOUND);
      if (session.status !== "live") {
        return codedError(409, "not_live", session.status === "lobby" ? "The session has not started yet" : SESSION_ENDED);
      }
      const [participant] = await tx
        .select({ userId: roomSessionParticipants.userId })
        .from(roomSessionParticipants)
        .where(and(eq(roomSessionParticipants.sessionId, session.id), eq(roomSessionParticipants.userId, user.id)))
        .limit(1);
      if (!participant) return jsonError(403, JOIN_FIRST);
      const [slot] = await tx
        .select({ problemId: roomSessionProblems.problemId })
        .from(roomSessionProblems)
        .where(and(eq(roomSessionProblems.sessionId, session.id), eq(roomSessionProblems.position, position)))
        .limit(1);
      if (!slot) return jsonError(404, SLOT_NOT_FOUND);
      if (slot.problemId !== null) return codedError(409, "judged_slot", JUDGED_SLOT);
      const limited = selfReportLimiter.hit(user.id);
      if (!limited.ok) return tooMany("Too many changes. Try again in a moment.", limited.retryAfterSec);

      const cell = and(
        eq(roomSessionResults.sessionId, session.id),
        eq(roomSessionResults.userId, user.id),
        eq(roomSessionResults.position, position),
      );
      const [existing] = await tx
        .select({ solveSeconds: roomSessionResults.solveSeconds, firstAcceptedAt: roomSessionResults.firstAcceptedAt })
        .from(roomSessionResults)
        .where(cell)
        .limit(1);

      if (!data.solved) {
        if (!existing) return json({ position, solved: false, solveSeconds: null });
        await tx.delete(roomSessionResults).where(cell);
        const totals = await recomputeSessionScores(tx, session.id);
        await appendRoomEvent(tx, session.id, {
          type: "solve_undone",
          actorUserId: user.id,
          payload: { position, solvedCount: totals.get(user.id)?.solvedCount ?? 0 },
        });
        return json({ position, solved: false, solveSeconds: null });
      }

      if (existing?.solveSeconds != null) return json({ position, solved: true, solveSeconds: existing.solveSeconds });
      // Server time only: the DB clock at this statement, measured from started_at.
      const values = {
        attempts: 1,
        wrongBeforeAccept: 0,
        firstAcceptedAt: sql`clock_timestamp()`,
        firstAcceptedSubmissionId: null,
        solveSeconds: sql`floor(extract(epoch from (clock_timestamp() - ${session.startedAt!.toISOString()}::timestamptz)))::int`,
        solvedBefore: false,
        updatedAt: sql`now()`,
      };
      const [row] = await tx
        .insert(roomSessionResults)
        .values({ sessionId: session.id, userId: user.id, position, ...values })
        .onConflictDoUpdate({
          target: [roomSessionResults.sessionId, roomSessionResults.userId, roomSessionResults.position],
          set: values,
        })
        .returning({ solveSeconds: roomSessionResults.solveSeconds, firstAcceptedAt: roomSessionResults.firstAcceptedAt });
      const totals = await recomputeSessionScores(tx, session.id);
      const [earlier] = await tx
        .select({ n: count() })
        .from(roomSessionResults)
        .where(
          and(
            eq(roomSessionResults.sessionId, session.id),
            eq(roomSessionResults.position, position),
            sql`${roomSessionResults.userId} <> ${user.id}`,
            lt(roomSessionResults.firstAcceptedAt, row.firstAcceptedAt!),
            gt(roomSessionResults.attempts, 0),
          ),
        );
      await appendRoomEvent(tx, session.id, {
        type: "problem_solved",
        actorUserId: user.id,
        payload: {
          position,
          solveSeconds: row.solveSeconds!,
          wrongBefore: 0,
          firstSolver: earlier.n === 0,
          solvedCount: Math.max(1, totals.get(user.id)?.solvedCount ?? 1),
          selfReported: true,
        },
      });
      return json({ position, solved: true, solveSeconds: row.solveSeconds });
    },
  );
}
