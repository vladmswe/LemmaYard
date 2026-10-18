import { NextResponse } from "next/server";
import type { z } from "zod";

import { DATABASE_UNAVAILABLE_MESSAGE, isDatabaseUnavailable } from "@/server/db/availability";
import { getEnv } from "@/server/env";
import { logError } from "@/server/log";

export function jsonError(
  status: number,
  error: string,
  fieldErrors?: Partial<Record<string, string>>,
): NextResponse {
  return NextResponse.json(fieldErrors ? { error, fieldErrors } : { error }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * 500 for an unexpected failure (503 when the database is unreachable or not set up). Logged with logError,
 * which keeps only the driver's message: an unhandled Drizzle error would be
 * printed by Next.js with its SQL params, i.e. user code or an email.
 */
export function internalServerError(event: string, error: unknown): NextResponse {
  logError(event, error);
  if (isDatabaseUnavailable(error)) {
    // The database is down, misconfigured or not migrated yet: tell the user
    // plainly and let clients retry later (503), instead of a vague 500.
    const response = jsonError(503, DATABASE_UNAVAILABLE_MESSAGE);
    response.headers.set("Retry-After", "30");
    return response;
  }
  return jsonError(500, "Something went wrong. Try again.");
}

/**
 * CSRF guard for every mutating route handler (PLAN section 6, step 1):
 * `Content-Type` must be `application/json`, and an `Origin` header, when
 * present, must equal the origin of `AUTH_URL`. Requests without `Origin`
 * (curl, same-origin GETs in old browsers) are allowed.
 *
 * Returns a 403 response to send back, or `null` when the request passes.
 */
export function assertSameOrigin(request: Request): NextResponse | null {
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    return jsonError(403, "Content-Type must be application/json");
  }
  const origin = request.headers.get("origin");
  if (origin !== null && origin !== new URL(getEnv().AUTH_URL).origin) {
    return jsonError(403, "Cross-origin request rejected");
  }
  return null;
}

/** Reads the body as UTF-8, or returns null once it exceeds `maxBytes`. */
async function readTextWithLimit(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Reads a JSON body of at most `maxBytes` and validates it with `schema`.
 * Returns the parsed data (plus the raw body text, for checks that must see
 * the literals before `JSON.parse`) or an error response (413 too large,
 * 400 invalid).
 */
export async function readJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
  maxBytes: number,
): Promise<{ data: z.infer<T>; text: string } | { response: NextResponse }> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > maxBytes) {
    return { response: jsonError(413, "Request body too large") };
  }
  const text = await readTextWithLimit(request, maxBytes);
  if (text === null) {
    return { response: jsonError(413, "Request body too large") };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { response: jsonError(400, "Invalid JSON body") };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.length > 0 ? String(issue.path[0]) : "body";
      fieldErrors[key] ??= issue.message;
    }
    return { response: jsonError(400, "Invalid input", fieldErrors) };
  }
  return { data: result.data, text };
}
