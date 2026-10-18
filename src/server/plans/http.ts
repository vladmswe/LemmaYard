// Shared steps of every /api/plans route (docs/specs/community.md AC-C-GEN-3,
// PLAN §6): flag off → 404; then same-origin 403 → session 401 → size 413 /
// strict Zod 400; the handler then runs in ONE transaction that first takes
// the user's advisory lock (limits.ts) and does target 404 → role 403 →
// state 409 → rate 429 → write. Rejected requests write nothing. Unexpected
// errors are logged without SQL parameters (they can hold user text).
import { NextResponse } from "next/server";
import type { z } from "zod";

import { PLAN_BODY_MAX_BYTES } from "@/lib/plans/schemas";
import { getCurrentUser, type SessionUser } from "@/server/auth/session";
import { getDb } from "@/server/db";
import { assertSameOrigin, internalServerError, jsonError, readJsonBody } from "@/server/http/request";

import { findReadablePlan, type PlanAccess } from "./access";
import { plansEnabled } from "./flag";
import { checkPlanWriteRate, lockPlanWriter } from "./limits";
import type { Tx } from "./types";

export const PLAN_NOT_FOUND = "Study plan not found";
export const OWNER_ONLY = "Only the owner can change this plan";
export const SIGN_IN_REQUIRED = "Log in to continue";

export function json(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/** Flag off: the same body as an unknown route. */
export function featureOff(): NextResponse {
  return jsonError(404, "Not found");
}

export function planNotFound(): NextResponse {
  return jsonError(404, PLAN_NOT_FOUND);
}

export function tooMany(retryAfterSec: number): NextResponse {
  const response = jsonError(429, "You are changing study plans too quickly. Try again later.");
  response.headers.set("Retry-After", String(retryAfterSec));
  return response;
}

export type WriteContext<T> = { tx: Tx; user: SessionUser; data: T };

/** A mutating plan route: steps 1–3, then `handler` inside the locked transaction. */
export async function planWrite<T extends z.ZodType>(
  request: Request,
  schema: T,
  event: string,
  handler: (ctx: WriteContext<z.infer<T>>) => Promise<NextResponse>,
): Promise<NextResponse> {
  if (!plansEnabled()) return featureOff();
  const denied = assertSameOrigin(request);
  if (denied) return denied;
  const user = await getCurrentUser();
  if (!user) return jsonError(401, SIGN_IN_REQUIRED);
  const body = await readJsonBody(request, schema, PLAN_BODY_MAX_BYTES);
  if ("response" in body) return body.response;
  try {
    return await getDb().transaction(async (tx) => {
      await lockPlanWriter(tx, user.id);
      return handler({ tx, user, data: body.data });
    });
  } catch (error) {
    return internalServerError(`plans.${event}_failed`, error);
  }
}

/**
 * The plan for a write by its owner: 404 when the caller cannot read it,
 * 403 when they can but do not own it. Locks the plan row.
 */
export async function ownedPlan(
  tx: Tx,
  planId: string,
  userId: string,
): Promise<{ plan: PlanAccess } | { response: NextResponse }> {
  const plan = await findReadablePlan(tx, planId, userId, null, { forUpdate: true });
  if (!plan) return { response: planNotFound() };
  if (plan.role !== "owner") return { response: jsonError(403, OWNER_ONLY) };
  return { plan };
}

/** 429 response when this write would exceed the hourly budget, else null. */
export async function rateLimited(tx: Tx, userId: string, cost = 1): Promise<NextResponse | null> {
  const check = await checkPlanWriteRate(tx, userId, cost);
  return check.ok ? null : tooMany(check.retryAfterSec);
}

/** GET routes: flag check and a JSON error boundary (reads are not rate limited, §C.7). */
export async function planRead(event: string, handler: () => Promise<NextResponse>): Promise<NextResponse> {
  if (!plansEnabled()) return featureOff();
  try {
    return await handler();
  } catch (error) {
    return internalServerError(`plans.${event}_failed`, error);
  }
}
