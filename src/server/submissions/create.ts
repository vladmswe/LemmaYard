// POST /api/problems/:slug/run and /submit (PLAN.md section 6). One path for
// both kinds; checks run strictly in the plan's order and a rejected request
// never writes a row.
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { JUDGE_DISABLED_API_MESSAGE } from "@/lib/judge-availability";
import { signatureSchema } from "@/lib/problems/schema";
import type { Language, SubmissionKind } from "@/lib/submission-dto";
import { LANGUAGE_LABELS } from "@/lib/workspace/languages";
import { getCurrentUser } from "@/server/auth/session";
import { getDb, type Db } from "@/server/db";
import { problems, submissions } from "@/server/db/schema";
import { getEnv } from "@/server/env";
import { assertSameOrigin, internalServerError, jsonError, readJsonBody } from "@/server/http/request";
import { judgeDisabledResponse, judgeEnabled } from "@/server/judge";
import {
  checkSubmitSession,
  recheckSubmitSession,
  type SessionSubmitRejection,
} from "@/server/rooms/submit-context";

import {
  checkCustomInput,
  checkPayload,
  MAX_BODY_BYTES,
  runBodySchema,
  submitBodySchema,
  type Rejection,
} from "./validate";

/** Retry-After for the active-submission cap: active jobs usually finish within seconds. */
export const ACTIVE_RETRY_AFTER_SEC = 2;
const RATE_WINDOW_SEC = 60;

export type Limits = {
  maxActive: number;
  /** Max rows of this kind per user in the last 60 s. */
  ratePerMin: number;
};

export type NewSubmission = {
  userId: string;
  problemId: string;
  kind: SubmissionKind;
  language: Language;
  code: string;
  customInput: Record<string, unknown> | null;
  /** Rooms: only for `submit` (DB CHECK); validated by the caller and re-checked in the transaction. */
  roomSessionId?: string | null;
};

export type InsertOutcome =
  | { ok: true; id: string }
  | { ok: false; reason: "active" | "rate"; retryAfterSec: number }
  | { ok: false; reason: "session"; rejection: SessionSubmitRejection };

/**
 * Step 6 + 7 in one transaction, serialized per user by
 * `pg_advisory_xact_lock(hashtext(user_id))`: two parallel requests of the
 * same user cannot both see "under the limit". Counts come from the DB.
 */
export async function insertWithLimits(
  db: Db,
  values: NewSubmission,
  limits: Limits,
): Promise<InsertOutcome> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${values.userId}::text))`);

    // Rooms: the session window again, under the session lock (user lock →
    // session lock; nothing that holds a session lock takes a user lock).
    if (values.roomSessionId) {
      const rejection = await recheckSubmitSession(tx, {
        sessionId: values.roomSessionId,
        userId: values.userId,
        problemId: values.problemId,
      });
      if (rejection) return { ok: false, reason: "session", rejection } as const;
    }

    const [active] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(submissions)
      .where(
        and(
          eq(submissions.userId, values.userId),
          inArray(submissions.status, ["queued", "running"]),
        ),
      );
    if (active.count >= limits.maxActive) {
      return { ok: false, reason: "active", retryAfterSec: ACTIVE_RETRY_AFTER_SEC } as const;
    }

    // Retry-After = when the oldest row of the window leaves it.
    const [recent] = await tx
      .select({
        count: sql<number>`count(*)::int`,
        retryAfterSec: sql<number | null>`ceil(extract(epoch from (min(${submissions.createdAt}) + make_interval(secs => ${RATE_WINDOW_SEC}) - clock_timestamp())))::int`,
      })
      .from(submissions)
      .where(
        and(
          eq(submissions.userId, values.userId),
          eq(submissions.kind, values.kind),
          gt(submissions.createdAt, sql`clock_timestamp() - make_interval(secs => ${RATE_WINDOW_SEC})`),
        ),
      );
    if (recent.count >= limits.ratePerMin) {
      const retryAfterSec = Math.min(RATE_WINDOW_SEC, Math.max(1, recent.retryAfterSec ?? 1));
      return { ok: false, reason: "rate", retryAfterSec } as const;
    }

    const [row] = await tx
      .insert(submissions)
      .values({ ...values, status: "queued", createdAt: sql`clock_timestamp()` })
      .returning({ id: submissions.id });
    return { ok: true, id: row.id } as const;
  });
}

function reject(r: Rejection): NextResponse {
  return jsonError(r.status, r.error, r.fieldErrors);
}

function rejectSession(r: SessionSubmitRejection): NextResponse {
  return NextResponse.json({ error: r.error, code: r.code }, { status: r.status, headers: { "Cache-Control": "no-store" } });
}

/** The whole handler of POST /api/problems/:slug/{run,submit}. */
export async function createSubmission(
  request: Request,
  slug: string,
  kind: SubmissionKind,
): Promise<NextResponse> {
  // (1) Content-Type + Origin.
  const denied = assertSameOrigin(request);
  if (denied) return denied;

  // (2) Session.
  const user = await getCurrentUser();
  if (!user) return jsonError(401, "Log in to run or submit code");

  // (2b) Judge disabled on this deployment (JUDGE_ENABLED): before the body,
  // the limits and any row, so nothing is queued that no worker would take.
  if (!judgeEnabled()) return judgeDisabledResponse(JUDGE_DISABLED_API_MESSAGE);

  // (3) Content-Length / body size, JSON, Zod.
  const schema = kind === "run" ? runBodySchema : submitBodySchema;
  const body = await readJsonBody(request, schema, MAX_BODY_BYTES);
  if ("response" in body) return body.response;
  const data = { customInput: undefined, ...body.data };

  // (4) Byte sizes, U+0000.
  const env = getEnv();
  const invalid = checkPayload(data, body.text, env.MAX_CODE_BYTES);
  if (invalid) return reject(invalid);

  // (5) Published problem; then custom input against its signature (needs the problem).
  const db = getDb();
  const [problem] = await db
    .select({ id: problems.id, signature: problems.signature, languages: problems.languages })
    .from(problems)
    .where(and(eq(problems.slug, slug), eq(problems.published, true)))
    .limit(1);
  if (!problem) return jsonError(404, "Problem not found");

  // (5a) The language must be one the problem offers (it has a verified
  // reference solution in that language: `problems.languages`).
  if (!problem.languages.includes(data.language)) {
    const message = `${LANGUAGE_LABELS[data.language]} is not available for this problem yet`;
    return jsonError(400, message, { language: message });
  }

  const customInput = data.customInput ?? null;
  if (customInput !== null) {
    const signature = signatureSchema.safeParse(problem.signature);
    if (!signature.success) return jsonError(500, "Problem signature is invalid");
    const bad = checkCustomInput(customInput, signature.data);
    if (bad) return reject(bad);
  }

  // (5b) Rooms session context (Submit only; Runs ignore it and never count).
  const roomSessionId = kind === "submit" ? (data.roomSessionId ?? null) : null;
  if (roomSessionId) {
    const rejected = await checkSubmitSession(db, { sessionId: roomSessionId, userId: user.id, problemId: problem.id });
    if (rejected) return rejectSession(rejected);
  }

  // (6) + (7) Limits and insert, one transaction under the per-user lock.
  // A failed insert carries the code in its SQL params: log it safely.
  const outcome = await insertWithLimits(
    db,
    {
      userId: user.id,
      problemId: problem.id,
      kind,
      language: data.language,
      code: data.code,
      customInput: customInput as Record<string, unknown> | null,
      roomSessionId,
    },
    {
      maxActive: env.MAX_ACTIVE_PER_USER,
      ratePerMin: kind === "run" ? env.RUN_RATE_PER_MIN : env.SUBMIT_RATE_PER_MIN,
    },
  ).catch((error: unknown) => ({ failed: error }) as const);
  if ("failed" in outcome) return internalServerError(`submissions.${kind}_insert_failed`, outcome.failed);
  if (!outcome.ok && outcome.reason === "session") return rejectSession(outcome.rejection);
  if (!outcome.ok) {
    const message =
      outcome.reason === "active"
        ? `You already have ${env.MAX_ACTIVE_PER_USER} submissions in progress; wait for them to finish`
        : `Too many ${kind === "run" ? "runs" : "submissions"}; try again in ${outcome.retryAfterSec} s`;
    const response = jsonError(429, message);
    response.headers.set("Retry-After", String(outcome.retryAfterSec));
    return response;
  }
  return NextResponse.json({ id: outcome.id }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
