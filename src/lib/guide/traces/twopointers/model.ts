// Visualization "twopointers.merge" (lesson arrays): merge two sorted lists
// with two pointers, including the step where one list runs out.
//
// Line ids, and the line of the snippet `arrays/merge` each one marks
// (Python / JavaScript, written in phase B; `@line` markers at line end):
//
//   merge.compare   if a[i] <= b[j]:      if (a[i] <= b[j]) {
//   merge.takeA     c.append(a[i])        c.push(a[i]);        (then i += 1)
//   merge.takeB     c.append(b[j])        c.push(b[j]);        (then j += 1)
//   merge.restA     c.extend(a[i:])       c.push(...a.slice(i));
//   merge.restB     c.extend(b[j:])       c.push(...b.slice(j));
//
// Unmarked: `c = []`, `i = j = 0`, `while i < len(a) and j < len(b):`,
// `else:`, the pointer increments and `return c`. One restA/restB frame is
// emitted per copied number (the copy is one line of code).
import type { InputSpec, ParseResult, VizModel } from "../../contracts";
import { parseIntList } from "../../input/parsers";

import { generateMerge } from "./merge";
import { MERGE_DEFAULT, MERGE_PRESETS } from "./presets";
import { MERGE_LINES, MERGE_MAX, MERGE_MAX_EACH, MERGE_MIN, type MergeInput, type MergeState } from "./types";

export * from "./types";

export function formatMerge(v: MergeInput): string {
  return `${v.a.join(", ")}; ${v.b.join(", ")}`;
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function parseSorted(raw: string, name: string): ParseResult<number[]> {
  const r = parseIntList(raw, { min: MERGE_MIN, max: MERGE_MAX, maxCount: MERGE_MAX_EACH, minCount: 0 });
  if (!r.ok) return fail(`${name}: ${r.error}`);
  for (let k = 1; k < r.value.length; k++) {
    const prev = r.value[k - 1] as number;
    const cur = r.value[k] as number;
    if (cur < prev) return fail(`${name}: sort it from small to large (${cur} comes after ${prev})`);
  }
  return r;
}

export function parseMerge(raw: string): ParseResult<MergeInput> {
  const parts = raw.split(";");
  if (parts.length !== 2) return fail("Write list A, a semicolon, then list B, e.g. 1, 4, 9; 2, 3, 10");
  const a = parseSorted(parts[0] as string, "A");
  if (!a.ok) return a;
  const b = parseSorted(parts[1] as string, "B");
  if (!b.ok) return b;
  if (a.value.length + b.value.length === 0) return fail("Enter at least one number in A or B");
  return { ok: true, value: { a: a.value, b: b.value } };
}

const mergeInput: InputSpec<MergeInput> = {
  label: "Sorted lists A and B",
  placeholder: "1, 3, 5; 2, 4",
  help: `Two sorted lists separated by a semicolon, each with up to ${MERGE_MAX_EACH} whole numbers from ${MERGE_MIN} to ${MERGE_MAX}. One list may be empty.`,
  maxLength: 120,
  parse: parseMerge,
  format: formatMerge,
  presets: MERGE_PRESETS,
};

function describeMerge(s: MergeState): string {
  const list = (cells: readonly { value: number }[]) => (cells.length ? cells.map((c) => c.value).join(", ") : "empty");
  const out = s.c.filter((x) => x !== null).map((x) => x.value);
  return `A: ${list(s.a)}; i = ${s.i}. B: ${list(s.b)}; j = ${s.j}. C so far: ${out.length ? out.join(", ") : "empty"} (${out.length} of ${s.c.length}).${
    s.ranOut ? ` ${s.ranOut} ran out.` : ""
  }`;
}

export const mergeModel: VizModel<MergeState, MergeInput> = {
  id: "twopointers.merge",
  title: "Merge two sorted lists",
  generate: generateMerge,
  describe: describeMerge,
  ids: (s) => [...s.a.map((x) => x.id), ...s.b.map((x) => x.id), ...s.c.flatMap((x) => (x ? [x.id] : []))],
  defaultInput: MERGE_DEFAULT,
  input: mergeInput,
  lineIds: MERGE_LINES,
  counters: ["comparisons", "writes"],
};

export function mergeTable(s: MergeState) {
  const rows: (string | number)[][] = [];
  const len = Math.max(s.a.length, s.b.length, s.c.length);
  for (let k = 0; k < len; k++) {
    const a = s.a[k];
    const b = s.b[k];
    const c = s.c[k];
    rows.push([
      k,
      a ? `${a.value}${k < s.i ? " (used)" : ""}` : "",
      b ? `${b.value}${k < s.j ? " (used)" : ""}` : "",
      c ? c.value : "",
    ]);
  }
  return { caption: `Merge: i = ${s.i}, j = ${s.j}`, columns: ["Index", "A", "B", "C"], rows };
}
