// Shared steps of every community route (docs/specs/community.md §C.2,
// AC-C-GEN-1..3). Writes:
//   flag off → 404 · read-only → 503 {"code":"community_read_only"} ·
//   (1) Content-Type + Origin → 403 · (2) session → 401 · (3) size → 413,
//   Zod / \u0000 → 400 · then the handler, in one transaction holding the
//   user's community lock: target → 404, role / suspension → 403,
//   state → 409, rate → 429, write.
// A `CommunityError` thrown anywhere becomes its JSON answer and rolls the
// transaction back, so rejected requests write nothing. Responses are
// `Cache-Control: no-store`. Request bodies and user text are never logged.
import { NextResponse } from "next/server";
import type { z } from "zod";

import type { CommunityViewer } from "@/lib/community/permissions";
import { getCurrentUser } from "@/server/auth/session";
import { getDb, type Db } from "@/server/db";
import { assertSameOrigin, internalServerError, readJsonBody } from "@/server/http/request";

import { getCommunityViewer } from "./access";
import { CommunityError } from "./errors";
import { communityFlags } from "./flags";
import { withCommunityLock, type Tx } from "./limits";

export const NOT_FOUND_MESSAGE = "Not found";

export function communityJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorResponse(error: CommunityError): NextResponse {
  const body: Record<string, unknown> = { error: error.message, code: error.code };
  if (error.until) body.until = error.until;
  if (error.fieldErrors) body.fieldErrors = error.fieldErrors;
  const response = communityJson(body, error.status);
  if (error.retryAfterSec !== undefined) response.headers.set("Retry-After", String(error.retryAfterSec));
  return response;
}

/** 404 with the same body whether the flag is off or the thing does not exist. */
export function communityNotFound(): NextResponse {
  return errorResponse(new CommunityError(404, "not_found", NOT_FOUND_MESSAGE));
}

function readOnlyResponse(): NextResponse {
  const response = errorResponse(
    new CommunityError(503, "community_read_only", "Discussions are read-only for now. Try again later."),
  );
  response.headers.set("Retry-After", "300");
  return response;
}

function handleFailure(event: string, error: unknown): NextResponse {
  if (error instanceof CommunityError) return errorResponse(error);
  return internalServerError(event, error);
}

/** GET routes: 404 while the flag is off; guests may read. */
export async function communityRead(
  event: string,
  handler: (ctx: { db: Db; viewer: CommunityViewer | null; now: Date }) => Promise<NextResponse>,
): Promise<NextResponse> {
  if (!communityFlags().enabled) return communityNotFound();
  try {
    const now = new Date();
    const db = getDb();
    const user = await getCurrentUser();
    const viewer = user ? await getCommunityViewer(db, user.id, now) : null;
    return await handler({ db, viewer, now });
  } catch (error) {
    return handleFailure(event, error);
  }
}

export type WriteContext<T> = { tx: Tx; viewer: CommunityViewer; data: T; now: Date };

/**
 * A mutating community route. The handler runs inside one transaction that
 * holds `community:<user>` (§C.7), so its limit counts see every earlier
 * write of the same user, from any instance.
 */
export async function communityWrite<T extends z.ZodType>(
  event: string,
  request: Request,
  schema: T,
  maxBytes: number,
  handler: (ctx: WriteContext<z.infer<T>>) => Promise<NextResponse>,
): Promise<NextResponse> {
  const flags = communityFlags();
  if (!flags.enabled) return communityNotFound();
  if (flags.readOnly) return readOnlyResponse();
  const denied = assertSameOrigin(request);
  if (denied) return denied;
  try {
    const user = await getCurrentUser();
    if (!user) return errorResponse(new CommunityError(401, "unauthorized", "Log in to continue"));
    const body = await readJsonBody(request, schema, maxBytes);
    if ("response" in body) return body.response;
    const db = getDb();
    return await db.transaction(async (tx) => {
      const now = new Date();
      await withCommunityLock(tx, user.id);
      const viewer = await getCommunityViewer(tx, user.id, now);
      if (!viewer) throw new CommunityError(401, "unauthorized", "Log in to continue");
      return handler({ tx, viewer, data: body.data, now });
    });
  } catch (error) {
    return handleFailure(event, error);
  }
}
