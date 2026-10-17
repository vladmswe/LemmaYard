// Visualization "prefix.sums" (lesson arrays): build the prefix-sum array p
// with the leading 0 sentinel, then answer a half-open range query [l, r).
//
// Line ids, and the line of the snippet `arrays/prefix_sums` each one marks
// (Python / JavaScript, written in phase B; `@line` markers at line end):
//
//   prefix.build.init   p = [0] * (len(a) + 1)       const p = new Array(a.length + 1).fill(0);
//   prefix.build.step   p[i + 1] = p[i] + a[i]       p[i + 1] = p[i] + a[i];
//   prefix.query        return p[r] - p[l]           return p[r] - p[l];
//
// Unmarked: `def prefix_sums(a):`, the `for i in range(len(a))` loop,
// `return p`, `def range_sum(p, l, r):` (JS `function prefixSums(a)`,
// `function rangeSum(p, l, r)`).
import type { InputSpec, ParseResult, VizModel } from "../../contracts";
import { parseIntList } from "../../input/parsers";

import { PREFIX_DEFAULT, PREFIX_PRESETS } from "./presets";
import { generatePrefix } from "./sums";
import {
  PREFIX_LINES,
  PREFIX_MAX,
  PREFIX_MAX_VALUES,
  PREFIX_MIN,
  type PrefixInput,
  type PrefixState,
} from "./types";

export * from "./types";

export function formatPrefix(v: PrefixInput): string {
  return `${v.values.join(", ")}; ${v.l} ${v.r}`;
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

export function parsePrefix(raw: string): ParseResult<PrefixInput> {
  const parts = raw.split(";");
  if (parts.length !== 2) return fail("Write the numbers, a semicolon, then l and r, e.g. 3, 1, 4, 1; 1 3");
  const values = parseIntList(parts[0] as string, { min: PREFIX_MIN, max: PREFIX_MAX, maxCount: PREFIX_MAX_VALUES });
  if (!values.ok) return values;
  const n = values.value.length;
  const range = parseIntList(parts[1] as string, { min: 0, max: n, maxCount: 2, minCount: 2 });
  if (!range.ok) return fail(`Range: ${range.error.replace(/^Enter at least 2 numbers$/, "give l and r")}`);
  const [l, r] = range.value as [number, number];
  if (l > r) return fail(`Range: l = ${l} is larger than r = ${r}; write the smaller end first`);
  return { ok: true, value: { values: values.value, l, r } };
}

const prefixInput: InputSpec<PrefixInput> = {
  label: "Numbers and range",
  placeholder: "3, 1, 4, 1, 5; 1 4",
  help: `Up to ${PREFIX_MAX_VALUES} whole numbers from ${PREFIX_MIN} to ${PREFIX_MAX}, comma separated, then a semicolon and the range ends l r with 0 <= l <= r <= n (the range [l, r) leaves r out).`,
  maxLength: 120,
  parse: parsePrefix,
  format: formatPrefix,
  presets: PREFIX_PRESETS,
};

function describePrefix(s: PrefixState): string {
  const a = s.a.map((c) => c.value).join(", ");
  const p = s.p.map((c) => (c ? String(c.value) : "not built")).join(", ");
  const res = s.result !== null ? ` Sum of [${s.l}, ${s.r}) = ${s.result}.` : "";
  return `Array a: ${a}. Prefix sums p (${s.p.length} cells): ${p}. Query [${s.l}, ${s.r}).${res}`;
}

export const prefixSumsModel: VizModel<PrefixState, PrefixInput> = {
  id: "prefix.sums",
  title: "Prefix sums",
  generate: generatePrefix,
  describe: describePrefix,
  ids: (s) => [...s.a.map((c) => c.id), ...s.p.flatMap((c) => (c ? [c.id] : []))],
  defaultInput: PREFIX_DEFAULT,
  input: prefixInput,
  lineIds: PREFIX_LINES,
  counters: ["reads", "writes"],
};

export function prefixTable(s: PrefixState) {
  return {
    caption: `Array a and its prefix sums p; query [${s.l}, ${s.r})`,
    columns: ["Index", "a[i]", "p[i]"],
    rows: s.p.map((c, k): (string | number)[] => [k, k < s.a.length ? (s.a[k] as { value: number }).value : "", c ? c.value : ""]),
  };
}
