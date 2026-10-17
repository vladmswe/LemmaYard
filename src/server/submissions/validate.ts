// Request validation for run/submit (PLAN.md section 6, steps 3–4): Zod body
// schemas, byte-size limits (UTF-8 bytes, not characters), U+0000 rejection,
// custom input against the problem signature. Pure functions.
import { z } from "zod";

import { LANGUAGES } from "@/lib/submission-dto";
import { findUnsafeNumberLiterals, validateInput, type SignatureLike } from "@/lib/types";

/** Whole request body (step 3): code (64 KB) + custom input (16 KB) + JSON overhead. */
export const MAX_BODY_BYTES = 70 * 1024;
/** Serialized JSON of `customInput` (step 4). */
export const MAX_CUSTOM_INPUT_BYTES = 16 * 1024;

const language = z.enum(LANGUAGES, { error: "Language must be python or javascript" });
const code = z.string({ error: "Code must be a string" }).min(1, "Code is required");

/** Rooms (docs/specs/rooms.md §3.4): the session this submit should count for. */
const roomSessionId = z.uuid({ error: "roomSessionId must be a session id" }).optional();

export const submitBodySchema = z.strictObject({ language, code, roomSessionId });
export const runBodySchema = z.strictObject({
  language,
  code,
  // Shape is checked against the signature later (validateInput).
  customInput: z.unknown().optional(),
  // Accepted and ignored: Runs never count for a session (spec §3.4).
  roomSessionId,
});

export type RunBody = z.infer<typeof runBodySchema>;

export type Rejection = {
  status: 400 | 413;
  error: string;
  fieldErrors?: Partial<Record<string, string>>;
};

const encoder = new TextEncoder();
export const byteLength = (text: string) => encoder.encode(text).byteLength;

/** True when any string or object key inside `value` contains U+0000. */
export function containsNul(value: unknown, depth = 0): boolean {
  if (typeof value === "string") return value.includes("\u0000");
  if (typeof value !== "object" || value === null || depth > 64) return false;
  if (Array.isArray(value)) return value.some((v) => containsNul(v, depth + 1));
  return Object.entries(value).some(([k, v]) => k.includes("\u0000") || containsNul(v, depth + 1));
}

/**
 * Step 4: sizes and U+0000. `rawText` is the request body before
 * `JSON.parse`, used to reject number literals that parsing would silently
 * change (only `customInput` can contain numbers: the other fields are strings).
 */
export function checkPayload(
  body: RunBody,
  rawText: string,
  maxCodeBytes: number,
): Rejection | null {
  if (byteLength(body.code) > maxCodeBytes) {
    return {
      status: 413,
      error: `Code is too large (max ${maxCodeBytes} bytes)`,
      fieldErrors: { code: `Code must be at most ${maxCodeBytes} bytes` },
    };
  }
  const hasInput = body.customInput !== undefined && body.customInput !== null;
  if (hasInput && byteLength(JSON.stringify(body.customInput)) > MAX_CUSTOM_INPUT_BYTES) {
    return {
      status: 413,
      error: `Custom input is too large (max ${MAX_CUSTOM_INPUT_BYTES} bytes)`,
      fieldErrors: { customInput: `Custom input must be at most ${MAX_CUSTOM_INPUT_BYTES} bytes` },
    };
  }
  if (body.code.includes("\u0000")) {
    return {
      status: 400,
      error: "Code must not contain the NUL character (\\u0000)",
      fieldErrors: { code: "Code must not contain the NUL character (\\u0000)" },
    };
  }
  if (hasInput && containsNul(body.customInput)) {
    return {
      status: 400,
      error: "Custom input must not contain the NUL character (\\u0000)",
      fieldErrors: { customInput: "Custom input must not contain the NUL character (\\u0000)" },
    };
  }
  if (hasInput) {
    const unsafe = findUnsafeNumberLiterals(rawText);
    if (unsafe.length > 0) return invalidCustomInput(unsafe.map((u) => u.message));
  }
  return null;
}

function invalidCustomInput(messages: string[]): Rejection {
  const text = messages.join("; ");
  return { status: 400, error: `Invalid custom input: ${text}`, fieldErrors: { customInput: text } };
}

/** Custom input against the problem signature (shared validator, AC-M5-4). */
export function checkCustomInput(customInput: unknown, signature: SignatureLike): Rejection | null {
  const issues = validateInput(customInput, signature);
  if (issues.length === 0) return null;
  return invalidCustomInput(
    issues.map((i) => (i.path === "$" ? i.message : `${i.path.slice(2)}: ${i.message}`)),
  );
}
