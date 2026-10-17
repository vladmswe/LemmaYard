// Visualization "array.shift" (lesson arrays): a fixed-capacity array with
// insertAt(i, v) and removeAt(i). Every element after i moves one slot, one
// move per frame, so the learner sees why the cost is O(n - i).
//
// Line ids, and the line of the snippet `arrays/fixed_array` each one marks
// (Python / JavaScript, written in phase B; `@line` markers at line end):
//
//   array.insert.full    if self.size == len(self.data):    if (this.size === this.data.length) {
//   array.insert.range   if not 0 <= i <= self.size:        if (i < 0 || i > this.size) {
//   array.insert.shift   self.data[k + 1] = self.data[k]    this.data[k + 1] = this.data[k];
//   array.insert.write   self.data[i] = value               this.data[i] = value;
//   array.remove.range   if not 0 <= i < self.size:         if (i < 0 || i >= this.size) {
//   array.remove.read    value = self.data[i]               const value = this.data[i];
//   array.remove.shift   self.data[k] = self.data[k + 1]    this.data[k] = this.data[k + 1];
//   array.remove.clear   self.data[self.size] = None        this.data[this.size] = null;   (after size -= 1)
//
// The shift loops run `for k in range(self.size - 1, i - 1, -1)` (insert) and
// `for k in range(i, self.size - 1)` (remove); failing checks raise IndexError
// (JS: RangeError). The trace shows a failed op as an error frame and goes on.
import type { InputSpec, ParseResult, VizModel } from "../../contracts";
import { parseIntList, parseOpScript } from "../../input/parsers";

import { ARRAY_DEFAULT, ARRAY_PRESETS } from "./presets";
import { generateShift } from "./shift";
import {
  ARRAY_CAPACITY,
  ARRAY_ID,
  ARRAY_LINES,
  ARRAY_MAX,
  ARRAY_MAX_OPS,
  ARRAY_MIN,
  opLabel,
  type ArrayInput,
  type ArrayOp,
  type ArrayState,
} from "./types";

export * from "./types";

export function formatArray(v: ArrayInput): string {
  return `${v.values.join(", ")}: ${v.ops.map(opLabel).join(", ")}`;
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

export function parseArray(raw: string): ParseResult<ArrayInput> {
  const cut = raw.indexOf(":");
  if (cut === -1) return fail("Write the numbers, a colon, then the ops, e.g. 3, 8, 1: insert 1 7, remove 0");
  const values = parseIntList(raw.slice(0, cut), {
    min: ARRAY_MIN,
    max: ARRAY_MAX,
    maxCount: ARRAY_CAPACITY,
    minCount: 0,
  });
  if (!values.ok) {
    return fail(values.error.startsWith("Too many") ? `At most ${ARRAY_CAPACITY} numbers fit in the array` : values.error);
  }
  const ops = parseOpScript(
    raw.slice(cut + 1),
    { insert: ["int", "int"], remove: ["int"] } as const,
    { min: ARRAY_MIN, max: ARRAY_MAX, maxOps: ARRAY_MAX_OPS },
  );
  if (!ops.ok) return ops;
  return {
    ok: true,
    value: {
      values: values.value,
      ops: ops.value.map((c): ArrayOp =>
        c.op === "insert"
          ? { kind: "insert", index: c.args[0] as number, value: c.args[1] as number }
          : { kind: "remove", index: c.args[0] as number },
      ),
    },
  };
}

const arrayInput: InputSpec<ArrayInput> = {
  label: "Numbers and ops",
  placeholder: "3, 8, 1, 9: insert 1 7, remove 0",
  help: `Up to ${ARRAY_CAPACITY} whole numbers from ${ARRAY_MIN} to ${ARRAY_MAX}, a colon, then up to ${ARRAY_MAX_OPS} ops: insert <index> <value> or remove <index>, comma separated. Capacity is ${ARRAY_CAPACITY}.`,
  maxLength: 200,
  parse: parseArray,
  format: formatArray,
  presets: ARRAY_PRESETS,
};

export function logical(s: ArrayState): number[] {
  return s.slots.slice(0, s.size).map((it) => (it ? it.value : Number.NaN));
}

function describeArray(s: ArrayState): string {
  const cells = s.slots.map((it, k) => (it ? `${k}: ${it.value}` : `${k}: empty`)).join(", ");
  const op = s.op ? ` Current op: ${s.op}.` : "";
  return `Fixed array with capacity ${s.capacity}, size ${s.size}. Slots ${cells}.${op}`;
}

export const arrayShiftModel: VizModel<ArrayState, ArrayInput> = {
  id: "array.shift",
  title: "Array insert and remove",
  generate: generateShift,
  describe: describeArray,
  ids: (s) => [ARRAY_ID, ...s.slots.flatMap((it) => (it ? [it.id] : []))],
  defaultInput: ARRAY_DEFAULT,
  input: arrayInput,
  lineIds: ARRAY_LINES,
  counters: ["moves", "writes"],
};

export function arrayTable(s: ArrayState) {
  return {
    caption: `Array slots, size ${s.size} of capacity ${s.capacity}`,
    columns: ["Index", "Value", "In use"],
    rows: s.slots.map((it, k): (string | number)[] => [k, it ? it.value : "", k < s.size ? "yes" : "no"]),
  };
}
