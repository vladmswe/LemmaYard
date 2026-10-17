// Visualization "dynarray.ops" (lesson dynamic-arrays): append / pop on a
// dynamic array with a size/capacity split, doubling (or x1.5) when full and
// shrinking to half when sparse. Counters: writes, copies, resizes; the state
// keeps the cost of every op for the cost chart and its running average.
//
// Line ids, and the line of the snippet `dynamic-arrays/dynamic_array` each
// one marks (Python / JavaScript, written in phase B; `@line` markers at line end):
//
//   dynarray.append.grow   if self._size == self._capacity:      if (this.size === this.capacity) this.resize(this.capacity * 2);
//   dynarray.append.write  self._data[self._size] = value        this.data[this.size] = value;
//   dynarray.pop.empty     if self._size == 0:                    if (this.size === 0) throw new RangeError(...);
//   dynarray.pop.read      value = self._data[self._size]         const value = this.data[this.size];   (after size -= 1)
//   dynarray.pop.shrink    if 4 * self._size <= self._capacity and self._capacity // 2 >= self._min:
//                                                                 if (4 * this.size <= this.capacity && Math.floor(this.capacity / 2) >= this.min) {
//   dynarray.resize.alloc  new_data = [None] * new_capacity       const newData = new Array(newCapacity).fill(null);
//   dynarray.resize.copy   new_data[i] = self._data[i]            for (...) newData[i] = this.data[i];
//   dynarray.resize.swap   self._data = new_data                  this.data = newData;   (then capacity = new capacity)
//
// The snippet implements the default policy (x2, shrink at a quarter); the
// player's options (x1.5, shrink at half) reuse the same lines. Unmarked:
// the constructor, `self._size += 1`, `self._size -= 1`, clearing the popped
// slot, `return value`, `get(i)` with its range check, the copy loop header.
import type { InputSpec, ParseResult, VizModel } from "../../contracts";

import { formatAverage, generateDyn } from "./ops";
import { DYN_DEFAULT, DYN_PRESETS } from "./presets";
import {
  DYN_CAPACITIES,
  DYN_LINES,
  DYN_MAX,
  DYN_MAX_OPS,
  DYN_MIN,
  type DynCell,
  type DynInput,
  type DynOp,
  type DynState,
  type Growth,
  type ShrinkPolicy,
} from "./types";

export * from "./types";
export { formatAverage };
export type { DynResult } from "./ops";

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/** "cap 1 x2 1/4: append 3 8 1, pop 2" — consecutive appends and pops are grouped. */
export function formatDyn(v: DynInput): string {
  const clauses: string[] = [];
  let k = 0;
  while (k < v.ops.length) {
    const op = v.ops[k] as DynOp;
    if (op.kind === "append") {
      const vals: number[] = [];
      while (k < v.ops.length && (v.ops[k] as DynOp).kind === "append") {
        vals.push((v.ops[k] as { value: number }).value);
        k++;
      }
      clauses.push(`append ${vals.join(" ")}`);
    } else {
      let count = 0;
      while (k < v.ops.length && (v.ops[k] as DynOp).kind === "pop") {
        count++;
        k++;
      }
      clauses.push(count === 1 ? "pop" : `pop ${count}`);
    }
  }
  return `cap ${v.initialCapacity} x${v.growth} ${v.shrink === "quarter" ? "1/4" : "1/2"}: ${clauses.join(", ")}`;
}

function parseOptions(text: string): ParseResult<Pick<DynInput, "initialCapacity" | "growth" | "shrink">> {
  let initialCapacity: DynInput["initialCapacity"] = 1;
  let growth: Growth = 2;
  let shrink: ShrinkPolicy = "quarter";
  const tokens = text.trim().toLowerCase().split(/[\s,]+/).filter(Boolean);
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k] as string;
    if (t === "cap") {
      const n = Number(tokens[k + 1]);
      if (!(DYN_CAPACITIES as readonly number[]).includes(n)) return fail("Starting capacity must be 1, 2 or 4, e.g. cap 2");
      initialCapacity = n as DynInput["initialCapacity"];
      k++;
    } else if (t === "x2" || t === "x1.5") {
      growth = t === "x2" ? 2 : 1.5;
    } else if (t === "1/4" || t === "1/2") {
      shrink = t === "1/4" ? "quarter" : "half";
    } else {
      return fail(`Unknown option '${t.slice(0, 12)}': use cap 1|2|4, x2 or x1.5, and 1/4 or 1/2`);
    }
  }
  return { ok: true, value: { initialCapacity, growth, shrink } };
}

export function parseDyn(raw: string): ParseResult<DynInput> {
  const cut = raw.indexOf(":");
  const opts = parseOptions(cut === -1 ? "" : raw.slice(0, cut));
  if (!opts.ok) return opts;
  const clauses = (cut === -1 ? raw : raw.slice(cut + 1))
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (clauses.length === 0) return fail("Enter at least one op: append <numbers> or pop [count]");
  const ops: DynOp[] = [];
  for (const [ci, clause] of clauses.entries()) {
    const [name = "", ...args] = clause.split(/\s+/);
    const where = `Op ${ci + 1}`;
    if (name.toLowerCase() === "append") {
      if (args.length === 0) return fail(`${where}: append needs at least one number`);
      for (const a of args) {
        if (!/^[+-]?\d+$/.test(a)) return fail(`${where}: '${a.slice(0, 12)}' is not a whole number`);
        const v = Number(a);
        if (v < DYN_MIN || v > DYN_MAX) return fail(`${where}: ${a} is out of range (${DYN_MIN} to ${DYN_MAX})`);
        ops.push({ kind: "append", value: v === 0 ? 0 : v });
      }
    } else if (name.toLowerCase() === "pop") {
      if (args.length > 1) return fail(`${where}: write pop or pop <count>`);
      const count = args.length === 0 ? 1 : Number(args[0]);
      if (!Number.isInteger(count) || count < 1 || count > DYN_MAX_OPS) {
        return fail(`${where}: the pop count must be a whole number from 1 to ${DYN_MAX_OPS}`);
      }
      for (let t = 0; t < count; t++) ops.push({ kind: "pop" });
    } else {
      return fail(`${where} '${name.slice(0, 12)}' is not append or pop`);
    }
    if (ops.length > DYN_MAX_OPS) return fail(`Too many ops: at most ${DYN_MAX_OPS} appends and pops in total`);
  }
  return { ok: true, value: { ...opts.value, ops } };
}

const dynInput: InputSpec<DynInput> = {
  label: "Options and ops",
  placeholder: "cap 1 x2 1/4: append 3 8 1 9, pop 2",
  help: `Options cap 1|2|4 (starting capacity), x2 or x1.5 (growth), 1/4 or 1/2 (shrink when that share is in use), a colon, then ops: append <numbers> or pop [count]. Up to ${DYN_MAX_OPS} ops, numbers from ${DYN_MIN} to ${DYN_MAX}.`,
  maxLength: 200,
  parse: parseDyn,
  format: formatDyn,
  presets: DYN_PRESETS,
};

function cellsText(slots: readonly (DynCell | null)[]): string {
  return slots.map((c) => (c ? String(c.value) : "empty")).join(", ");
}

function describeDyn(s: DynState): string {
  const head = `Dynamic array, size ${s.size}, capacity ${s.buffer.capacity}. Slots: ${cellsText(s.buffer.slots)}.`;
  const next = s.next ? ` New buffer of ${s.next.capacity} slots being filled: ${cellsText(s.next.slots)}.` : "";
  const avg = s.costs.length ? ` ${s.costs.length} ops so far, average cost ${formatAverage(s.costs)}.` : "";
  return head + next + avg;
}

export const dynArrayModel: VizModel<DynState, DynInput> = {
  id: "dynarray.ops",
  title: "Dynamic array",
  generate: generateDyn,
  describe: describeDyn,
  ids: (s) => {
    const out = [s.buffer.id, ...s.buffer.slots.flatMap((c) => (c ? [c.id] : []))];
    if (s.next) out.push(s.next.id, ...s.next.slots.flatMap((c) => (c ? [c.id] : [])));
    return out;
  },
  defaultInput: DYN_DEFAULT,
  input: dynInput,
  lineIds: DYN_LINES,
  counters: ["writes", "copies", "resizes"],
};

export function dynTable(s: DynState) {
  const rows: (string | number)[][] = s.buffer.slots.map((c, k) => [
    k,
    c ? c.value : "",
    k < s.size ? "yes" : "no",
    s.next ? (s.next.slots[k]?.value ?? "") : "",
  ]);
  if (s.next) for (let k = s.buffer.capacity; k < s.next.capacity; k++) rows.push([k, "", "", ""]);
  return {
    caption: `Dynamic array: size ${s.size}, capacity ${s.buffer.capacity}${s.next ? `, new buffer of ${s.next.capacity}` : ""}`,
    columns: ["Slot", "Value", "In use", "New buffer"],
    rows,
  };
}
