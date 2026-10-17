// Custom input of a Run (AC-M5-4): one JSON value per signature parameter,
// checked on the client with the same validator the server uses
// (`@/lib/types`), so an invalid input disables Run with a readable reason.
import { formatValue } from "@/lib/problems/samples";
import {
  findUnsafeNumberLiterals,
  parseType,
  validateInput,
  validateValue,
  type SignatureLike,
  type ValueIssue,
} from "@/lib/types";

/** Same cap as the server (`MAX_CUSTOM_INPUT_BYTES`): serialized JSON of the whole object. */
export const CUSTOM_INPUT_LIMIT_BYTES = 16 * 1024;

/** Raw text per parameter name, as typed. */
export type CustomInputFields = Record<string, string>;

export type CustomInputResult =
  | { ok: true; input: Record<string, unknown> }
  | {
      ok: false;
      /** Per parameter name. */
      fieldErrors: Record<string, string>;
      /** Problems with the input as a whole (size). */
      formError?: string;
    };

/** Prefills the fields from a sample input (`[2, 7, 11]`, `"abc"`, `true`). */
export function fieldsFromInput(signature: SignatureLike, input: Record<string, unknown>): CustomInputFields {
  return Object.fromEntries(
    signature.params.map((p) => [p.name, Object.hasOwn(input, p.name) ? formatValue(input[p.name]) : ""]),
  );
}

/** `$.nums[2]` → `nums[2]`, `$` → `name`. */
function issueText(name: string, issue: ValueIssue): string {
  const where = issue.path.replace(/^\$(\.[^[]+)?/, name);
  return where === name && !issue.path.includes("[") ? issue.message : `${where}: ${issue.message}`;
}

function containsNul(value: unknown): boolean {
  if (typeof value === "string") return value.includes("\u0000");
  if (Array.isArray(value)) return value.some(containsNul);
  return false;
}

function parseField(name: string, typeSource: string, text: string): { value: unknown } | { error: string } {
  if (text.trim() === "") return { error: "Enter a value" };
  const unsafe = findUnsafeNumberLiterals(text);
  if (unsafe.length > 0) return { error: unsafe[0].message };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { error: 'Not valid JSON. Examples: [1, 2], 3, "text", true' };
  }
  const type = parseType(typeSource);
  if (!type) return { error: `Unknown type "${typeSource}"` };
  const issues = validateValue(value, type, `$.${name}`);
  if (issues.length > 0) return { error: issueText(name, issues[0]) };
  if (containsNul(value)) return { error: "Strings must not contain the NUL character (\\u0000)" };
  return { value };
}

export function parseCustomInput(signature: SignatureLike, fields: CustomInputFields): CustomInputResult {
  const input: Record<string, unknown> = {};
  const fieldErrors: Record<string, string> = {};
  for (const param of signature.params) {
    const parsed = parseField(param.name, param.type, fields[param.name] ?? "");
    if ("error" in parsed) fieldErrors[param.name] = parsed.error;
    else input[param.name] = parsed.value;
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };

  // Belt and braces: the whole object through the shared signature check.
  const issues = validateInput(input, signature);
  if (issues.length > 0) return { ok: false, fieldErrors: {}, formError: issues[0].message };

  const bytes = new TextEncoder().encode(JSON.stringify(input)).length;
  if (bytes > CUSTOM_INPUT_LIMIT_BYTES) {
    return {
      ok: false,
      fieldErrors: {},
      formError: `Custom input is too large (${Math.ceil(bytes / 1024)} KB); the limit is 16 KB`,
    };
  }
  return { ok: true, input };
}

/** One-line reason for the disabled Run button's tooltip. */
export function customInputSummary(result: CustomInputResult): string | null {
  if (result.ok) return null;
  if (result.formError) return result.formError;
  const [name, error] = Object.entries(result.fieldErrors)[0] ?? [];
  return name ? `Fix the custom input: ${name}: ${error}` : null;
}
