// A rejected community request. Thrown inside the write transaction (which
// rolls it back: rejected requests write nothing) and turned into JSON by
// src/server/community/http.ts: `{ error, code, until?, fieldErrors? }`.
import type { Decision } from "@/lib/community/permissions";

export class CommunityError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSec?: number;
  readonly until?: string;
  readonly fieldErrors?: Partial<Record<string, string>>;

  constructor(
    status: number,
    code: string,
    message: string,
    extra: { retryAfterSec?: number; until?: string; fieldErrors?: Partial<Record<string, string>> } = {},
  ) {
    super(message);
    this.name = "CommunityError";
    this.status = status;
    this.code = code;
    this.retryAfterSec = extra.retryAfterSec;
    this.until = extra.until;
    this.fieldErrors = extra.fieldErrors;
  }
}

/** Throws the denial of a permission decision. */
export function assertAllowed(decision: Decision): void {
  if (!decision.ok) {
    throw new CommunityError(decision.status, decision.code, decision.message, { until: decision.until });
  }
}

export function notFoundError(message = "Not found"): CommunityError {
  return new CommunityError(404, "not_found", message);
}
