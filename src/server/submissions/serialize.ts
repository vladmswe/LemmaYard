// Submission row → `SubmissionDto` (PLAN.md section 6, AC-M5-8). Whitelists
// every field: `failedCase` only for a Submit with `wrong_answer`,
// `caseResults` only for a Run (no `expected` for custom input), case values
// cut to 16 KB of JSON, `error` ≤ 8 KB, `stdout` ≤ 64 KB. The database keeps
// the full data; only the response is cut.
import {
  CASE_VALUE_LIMIT_BYTES,
  ERROR_LIMIT_BYTES,
  STDOUT_LIMIT_BYTES,
  TRUNCATED_MARKER,
  type CaseResultDto,
  type CaseResultStatus,
  type CaseValueField,
  type FailedCaseDto,
  type SubmissionDto,
} from "@/lib/submission-dto";
import type { CaseResult, submissions } from "@/server/db/schema";

// The DTO union must stay identical to the frozen DB contract.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
const statusesMatch: Same<CaseResultStatus, CaseResult["status"]> = true;
void statusesMatch;

export type SubmissionRow = Pick<
  typeof submissions.$inferSelect,
  | "id"
  | "kind"
  | "status"
  | "language"
  | "customInput"
  | "passedCount"
  | "totalCount"
  | "runtimeMs"
  | "memoryKb"
  | "error"
  | "stdout"
  | "caseResults"
  | "failedCase"
  | "createdAt"
  | "finishedAt"
> & { problem: { slug: string; title: string } };

const encoder = new TextEncoder();

/** The longest prefix of `text` that fits in `maxBytes` UTF-8 bytes (never splits a character). */
export function utf8Prefix(text: string, maxBytes: number): string {
  if (maxBytes <= 0) return "";
  const buffer = new Uint8Array(maxBytes);
  const { read } = encoder.encodeInto(text, buffer);
  return text.slice(0, read);
}

export function utf8Length(text: string): number {
  return encoder.encode(text).byteLength;
}

/** Cuts text to at most `limit` UTF-8 bytes, ending with the `[truncated]` marker when cut. */
export function limitText(text: string | null, limit: number): string | null {
  if (text === null || utf8Length(text) <= limit) return text;
  return utf8Prefix(text, limit - utf8Length(TRUNCATED_MARKER)) + TRUNCATED_MARKER;
}

const ELLIPSIS = "…";

/**
 * A value whose serialized JSON exceeds the limit becomes a string: the JSON
 * prefix plus "…", at most `limit` bytes in total (as serialized JSON).
 */
export function limitValue(
  value: unknown,
  limit = CASE_VALUE_LIMIT_BYTES,
): { value: unknown; truncated: boolean } {
  const json = JSON.stringify(value) ?? "null";
  if (utf8Length(json) <= limit) return { value, truncated: false };
  // The preview is itself sent as a JSON string: leave room for quotes and
  // escapes by cutting the escaped form, then decoding it back.
  let budget = limit - utf8Length(ELLIPSIS) - 2;
  let preview = utf8Prefix(json, budget);
  while (budget > 0 && utf8Length(JSON.stringify(preview + ELLIPSIS)) > limit) {
    budget -= Math.max(1, Math.ceil(budget / 16));
    preview = utf8Prefix(json, budget);
  }
  return { value: preview + ELLIPSIS, truncated: true };
}

function withLimitedValues<T extends Partial<Record<CaseValueField, unknown>>>(
  source: Partial<Record<CaseValueField, unknown>>,
  fields: readonly CaseValueField[],
  target: T,
): T & { truncated?: true; truncatedFields?: CaseValueField[] } {
  const truncatedFields: CaseValueField[] = [];
  const out = target as T & Record<string, unknown>;
  for (const field of fields) {
    if (!Object.hasOwn(source, field)) continue;
    const limited = limitValue(source[field]);
    out[field] = limited.value;
    if (limited.truncated) truncatedFields.push(field);
  }
  if (truncatedFields.length === 0) return out;
  return Object.assign(out, { truncated: true as const, truncatedFields });
}

function serializeCase(item: CaseResult, customInput: boolean): CaseResultDto {
  const fields: CaseValueField[] = customInput ? ["input", "actual"] : ["input", "expected", "actual"];
  const dto = withLimitedValues(item, fields, {
    index: item.index,
    status: item.status,
  } as CaseResultDto);
  if (typeof item.timeMs === "number") dto.timeMs = item.timeMs;
  if (typeof item.error === "string") dto.error = limitText(item.error, ERROR_LIMIT_BYTES)!;
  return dto;
}

function serializeFailedCase(failed: NonNullable<SubmissionRow["failedCase"]>): FailedCaseDto {
  return withLimitedValues(
    { input: failed.input, expected: failed.expected, actual: failed.actual },
    ["input", "expected", "actual"],
    {} as FailedCaseDto,
  );
}

export function toSubmissionDto(row: SubmissionRow): SubmissionDto {
  const dto: SubmissionDto = {
    id: row.id,
    kind: row.kind,
    status: row.status,
    language: row.language,
    problem: { slug: row.problem.slug, title: row.problem.title },
    passedCount: row.passedCount,
    totalCount: row.totalCount,
    runtimeMs: row.runtimeMs,
    memoryKb: row.memoryKb,
    error: limitText(row.error, ERROR_LIMIT_BYTES),
    stdout: limitText(row.stdout, STDOUT_LIMIT_BYTES),
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
  if (row.kind === "run" && Array.isArray(row.caseResults)) {
    const custom = row.customInput != null;
    dto.caseResults = row.caseResults.map((c) => serializeCase(c, custom));
  }
  if (row.kind === "submit" && row.status === "wrong_answer" && row.failedCase) {
    dto.failedCase = serializeFailedCase(row.failedCase);
  }
  return dto;
}
