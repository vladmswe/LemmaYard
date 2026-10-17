// Visualizations "search.linear" and "search.binary" (lesson complexity-basics).
// One player with an op selector shows both searches on the same sorted array,
// so both models generate either search (the op lives in the input) and share
// one code snippet and one set of line ids.
//
// Line ids, and the line of the snippet `complexity-basics/search` each one
// marks (Python / JavaScript, written in phase B; `@line` markers at line end):
//
//   search.linear.compare   if a[i] == target:            if (a[i] === target) {
//   search.linear.found     return i                       return i;
//   search.linear.notFound  return -1   (after the loop)   return -1;
//   search.binary.init      lo, hi = 0, len(a)             let lo = 0, hi = a.length;
//   search.binary.compare   if a[mid] < target:            if (a[mid] < target) {
//   search.binary.right     lo = mid + 1                   lo = mid + 1;
//   search.binary.left      hi = mid                       hi = mid;
//   search.binary.check     if lo < len(a) and a[lo] == target:
//                                                          if (lo < a.length && a[lo] === target) {
//   search.binary.found     return lo                      return lo;
//   search.binary.notFound  return -1   (after the check)  return -1;
//
// Unmarked lines of the snippet: `for i in range(len(a))`, `while lo < hi`,
// `mid = (lo + hi) // 2` (JS `Math.floor((lo + hi) / 2)`), `else`.
// Binary search is the lower-bound form on the half-open range [lo, hi):
// it returns the first index whose value equals the target, or -1.
import type { ElementId, InputSpec, ParseResult, VizModel } from "../../contracts";
import { parseIntList } from "../../input/parsers";

import { generateBinary } from "./binary";
import { itemId, toItems } from "./items";
import { generateLinear } from "./linear";
import { SEARCH_DEFAULT_BINARY, SEARCH_DEFAULT_LINEAR, SEARCH_PRESETS } from "./presets";

export { itemId, toItems };

export type SearchOp = "linear" | "binary";

export interface SearchItem {
  readonly id: ElementId;
  readonly value: number;
}

export interface SearchState {
  readonly op: SearchOp;
  readonly items: readonly SearchItem[]; // sorted, never changes during a trace
  readonly target: number;
  /** Binary search range [lo, hi); null for linear search and before the range is set. */
  readonly lo: number | null;
  readonly hi: number | null;
  /** Index being compared in this frame (linear i, binary mid or the final check). */
  readonly at: number | null;
  /** Linear search: how many cells have been compared so far. */
  readonly scanned: number;
  /** Returned index (or -1) on the last frame; null while searching. */
  readonly result: number | null;
}

export interface SearchInput {
  readonly op: SearchOp;
  readonly values: readonly number[]; // sorted, non-decreasing
  readonly target: number;
}

export const SEARCH_MAX_VALUES = 32;
export const SEARCH_MIN = -99;
export const SEARCH_MAX = 999;

export const LINEAR_LINES = ["search.linear.compare", "search.linear.found", "search.linear.notFound"] as const;
export const BINARY_LINES = [
  "search.binary.init",
  "search.binary.compare",
  "search.binary.right",
  "search.binary.left",
  "search.binary.check",
  "search.binary.found",
  "search.binary.notFound",
] as const;
export const SEARCH_LINES: readonly string[] = [...LINEAR_LINES, ...BINARY_LINES];

export const SEARCH_OPS: { id: SearchOp; label: string }[] = [
  { id: "linear", label: "Linear search" },
  { id: "binary", label: "Binary search" },
];

export function generateSearch(input: SearchInput) {
  return input.op === "binary" ? generateBinary(input) : generateLinear(input);
}

export function formatSearch(v: SearchInput): string {
  return `${v.op}: ${v.values.join(", ")}; ${v.target}`;
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

export function parseSearch(raw: string, defaultOp: SearchOp): ParseResult<SearchInput> {
  let text = raw.trim();
  let op = defaultOp;
  const m = /^(linear|binary)\s*:/i.exec(text);
  if (m) {
    op = (m[1] as string).toLowerCase() as SearchOp;
    text = text.slice(m[0].length);
  } else if (text.includes(":")) {
    return fail("Start with 'linear:' or 'binary:', or leave the prefix out");
  }
  const parts = text.split(";");
  if (parts.length !== 2) {
    return fail("Write the sorted numbers, a semicolon, then the target, e.g. 2, 5, 9; 5");
  }
  const values = parseIntList(parts[0] as string, {
    min: SEARCH_MIN,
    max: SEARCH_MAX,
    maxCount: SEARCH_MAX_VALUES,
  });
  if (!values.ok) return values;
  for (let k = 1; k < values.value.length; k++) {
    const prev = values.value[k - 1] as number;
    const cur = values.value[k] as number;
    if (cur < prev) {
      return fail(`Sort the numbers from small to large: ${cur} comes after ${prev}`);
    }
  }
  const target = parseIntList(parts[1] as string, { min: SEARCH_MIN, max: SEARCH_MAX, maxCount: 1 });
  if (!target.ok) return fail(`Target: ${target.error}`);
  return { ok: true, value: { op, values: values.value, target: target.value[0] as number } };
}

function searchInputSpec(defaultOp: SearchOp): InputSpec<SearchInput> {
  return {
    label: "Sorted numbers and target",
    placeholder: `${defaultOp}: 2, 5, 9, 14, 20; 14`,
    help: `Up to ${SEARCH_MAX_VALUES} whole numbers from ${SEARCH_MIN} to ${SEARCH_MAX} in increasing order, comma separated, then a semicolon and the target. Optional prefix linear: or binary:`,
    maxLength: 200,
    parse: (raw) => parseSearch(raw, defaultOp),
    format: formatSearch,
    presets: SEARCH_PRESETS,
  };
}

function describeSearch(s: SearchState): string {
  const n = s.items.length;
  const cells = s.items.map((it) => it.value).join(", ");
  const head = `Sorted array of ${n} numbers: ${cells}. Target ${s.target}. ${s.op === "binary" ? "Binary" : "Linear"} search.`;
  if (s.result !== null) {
    return s.result === -1 ? `${head} Result: -1, the target is not in the array.` : `${head} Result: index ${s.result}.`;
  }
  const parts: string[] = [];
  if (s.lo !== null && s.hi !== null) parts.push(`Range [${s.lo}, ${s.hi}) holds ${s.hi - s.lo} cells.`);
  if (s.op === "linear" && s.scanned > 0) parts.push(`${s.scanned} cells compared so far.`);
  if (s.at !== null) parts.push(`Comparing index ${s.at}, which holds ${s.items[s.at]?.value}.`);
  return parts.length > 0 ? `${head} ${parts.join(" ")}` : head;
}

function searchModel(op: SearchOp): VizModel<SearchState, SearchInput> {
  return {
    id: `search.${op}`,
    title: op === "binary" ? "Binary search" : "Linear search",
    generate: generateSearch,
    describe: describeSearch,
    ids: (s) => s.items.map((it) => it.id),
    defaultInput: op === "binary" ? SEARCH_DEFAULT_BINARY : SEARCH_DEFAULT_LINEAR,
    input: searchInputSpec(op),
    lineIds: SEARCH_LINES,
    counters: ["comparisons"],
  };
}

export const searchLinearModel = searchModel("linear");
export const searchBinaryModel = searchModel("binary");

export function searchTable(s: SearchState) {
  return {
    caption: `Sorted array, target ${s.target}, ${s.op} search`,
    columns: ["Index", "Value", "Status"],
    rows: s.items.map((it, k): (string | number)[] => {
      let status = "";
      if (s.result !== null && s.result === k) status = "found";
      else if (s.at === k) status = "comparing";
      else if (s.op === "binary" && s.lo !== null && s.hi !== null && (k < s.lo || k >= s.hi)) status = "ruled out";
      else if (s.op === "linear" && k < s.scanned) status = "checked";
      return [k, it.value, status];
    }),
  };
}
