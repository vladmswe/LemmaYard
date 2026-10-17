import type { Signature } from "./schema";

/**
 * A test value as learners read it: JSON with a space after commas
 * (`[2, 7, 11]`, `"abc"`, `true`). Strings keep their JSON quotes.
 */
export function formatValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(formatValue).join(", ")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${formatValue(v)}`);
    return `{${entries.join(", ")}}`;
  }
  return JSON.stringify(value) ?? String(value);
}

/**
 * `nums = [2, 7], target = 9` in signature parameter order; keys not in the
 * signature (should not happen after import validation) follow in input order.
 */
export function formatSampleInput(signature: Signature, input: Record<string, unknown>): string {
  const names = signature.params.map((p) => p.name);
  const extra = Object.keys(input).filter((k) => !names.includes(k));
  return [...names.filter((n) => n in input), ...extra]
    .map((name) => `${name} = ${formatValue(input[name])}`)
    .join(", ");
}

const CONSTRAINTS_HEADING = /^#{1,6}[ \t]+Constraints\b.*$/im;

/**
 * Splits a description before its "Constraints" heading so the page can put
 * the sample examples between the statement and the constraints. Without
 * that heading everything is `before`.
 */
export function splitAtConstraints(markdown: string): { before: string; after: string } {
  const match = CONSTRAINTS_HEADING.exec(markdown);
  if (!match) return { before: markdown, after: "" };
  return { before: markdown.slice(0, match.index), after: markdown.slice(match.index) };
}
