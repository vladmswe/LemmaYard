import { NextResponse } from "next/server";
import type { z } from "zod";

import { getEnv } from "@/server/env";

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
 * Returns the parsed data or an error response (413 too large, 400 invalid).
 */
export async function readJsonBody<T extends z.ZodType>(
  request: Request,
  schema: T,
  maxBytes: number,
): Promise<{ data: z.infer<T> } | { response: NextResponse }> {
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
  return { data: result.data };
}
