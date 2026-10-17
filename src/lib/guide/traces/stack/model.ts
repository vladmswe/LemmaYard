// Visualizations of the stacks lesson:
//
// "stack.ops": push / pop / peek on an array-backed stack (4 slots, doubles
// when full). Snippet `stacks/array_stack` (Python / JavaScript):
//   stack.push.grow   if self._size == len(self._data):     if (this.size === this.data.length) {
//   stack.push.write  self._data[self._size] = value         this.data[this.size] = value;
//   stack.pop.empty   if self._size == 0:  (in pop)          if (this.size === 0) throw ...  (in pop)
//   stack.pop.read    value = self._data[self._size]         const value = this.data[this.size];  (after size -= 1)
//   stack.peek.empty  if self._size == 0:  (in peek)         if (this.size === 0) throw ...  (in peek)
//   stack.peek.read   return self._data[self._size - 1]      return this.data[this.size - 1];
//
// "stack.brackets": bracket matching. Snippet `stacks/brackets`:
//   brackets.push   stack.append(ch)            stack.push(ch);
//   brackets.skip   continue  (not a bracket)   continue;
//   brackets.empty  if not stack:               if (stack.length === 0) return false;
//   brackets.match  if stack.pop() != PAIRS[ch]:  if (stack.pop() !== PAIRS[ch]) return false;
//   brackets.end    return not stack            return stack.length === 0;
//
// "stack.monotonic": next greater element. Snippet `stacks/next_greater`:
//   monotonic.pop   answer[stack.pop()] = x     answer[stack.pop()] = x;   (inside the while loop)
//   monotonic.push  stack.append(i)             stack.push(i);
import type { InputSpec, ParseResult, VizModel } from "../../contracts";
import { parseIntList, parseOpScript } from "../../input/parsers";

import { generateBrackets } from "./brackets";
import { generateMonotonic } from "./monotonic";
import { generateStackOps } from "./ops";
import {
  BRACKETS_DEFAULT,
  BRACKETS_PRESETS,
  MONO_DEFAULT,
  MONO_PRESETS,
  STACK_DEFAULT,
  STACK_PRESETS,
} from "./presets";
import {
  BRACKETS_LINES,
  BRACKETS_MAX_LENGTH,
  MONO_LINES,
  MONO_MAX,
  MONO_MAX_VALUES,
  MONO_MIN,
  STACK_LINES,
  STACK_MAX,
  STACK_MAX_OPS,
  STACK_MIN,
  monoAnswerId,
  monoEntryId,
  stackOpLabel,
  type BracketsInput,
  type BracketsState,
  type MonoInput,
  type MonoState,
  type StackInput,
  type StackItem,
  type StackOp,
  type StackState,
} from "./types";

export * from "./types";
export type { StackResult } from "./ops";

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

// ------------------------------------------------------------ stack.ops

export function formatStack(v: StackInput): string {
  return v.ops.map(stackOpLabel).join(", ");
}

export function parseStack(raw: string): ParseResult<StackInput> {
  const r = parseOpScript(raw, { push: ["int"], pop: [], peek: [] } as const, {
    min: STACK_MIN,
    max: STACK_MAX,
    maxOps: STACK_MAX_OPS,
  });
  if (!r.ok) return r;
  return {
    ok: true,
    value: {
      ops: r.value.map((c): StackOp => (c.op === "push" ? { kind: "push", value: c.args[0] as number } : { kind: c.op })),
    },
  };
}

const stackInput: InputSpec<StackInput> = {
  label: "Stack ops",
  placeholder: "push 1, push 2, pop, peek",
  help: `Up to ${STACK_MAX_OPS} ops, comma separated: push <number>, pop or peek. Numbers from ${STACK_MIN} to ${STACK_MAX}.`,
  maxLength: 200,
  parse: parseStack,
  format: formatStack,
  presets: STACK_PRESETS,
};

function describeStack(s: StackState): string {
  const values = s.slots.slice(0, s.size).map((it) => (it as StackItem).value);
  const body = s.size ? `Bottom to top: ${values.join(", ")}; top = ${s.top}.` : "It is empty; top = -1.";
  const out = s.out === null ? "" : s.out === "error" ? " The last pop or peek failed." : ` Last returned value: ${s.out}.`;
  return `Stack in an array of ${s.capacity} slots, size ${s.size}. ${body}${out}`;
}

export const stackOpsModel: VizModel<StackState, StackInput> = {
  id: "stack.ops",
  title: "Stack push, pop and peek",
  generate: generateStackOps,
  describe: describeStack,
  ids: (s) => [
    s.bufferId,
    ...s.slots.flatMap((it) => (it ? [it.id] : [])),
    ...(s.popped ? [s.popped.id] : []),
  ],
  defaultInput: STACK_DEFAULT,
  input: stackInput,
  lineIds: STACK_LINES,
  counters: ["writes", "reads", "copies"],
};

export function stackTable(s: StackState) {
  return {
    caption: `Stack array: size ${s.size} of capacity ${s.capacity}, top = ${s.top}`,
    columns: ["Index", "Value", "Note"],
    rows: s.slots.map((it, k): (string | number)[] => [
      k,
      it ? it.value : s.popped && k === s.size ? s.popped.value : "",
      k === s.top ? "top" : s.popped && k === s.size ? "just popped" : "",
    ]),
  };
}

// ------------------------------------------------------------ stack.brackets

export function parseBrackets(raw: string): ParseResult<BracketsInput> {
  if (raw.length === 0) return fail("Enter some text with brackets, e.g. (a[b]c)");
  if (raw.length > BRACKETS_MAX_LENGTH) return fail(`Too long: ${raw.length} characters (at most ${BRACKETS_MAX_LENGTH})`);
  const bad = Array.from(raw).find((ch) => ch < " " || ch > "~");
  if (bad !== undefined) return fail("Use plain characters only: letters, digits, spaces, brackets and symbols such as + - * < =");
  return { ok: true, value: { text: raw } };
}

const bracketsInput: InputSpec<BracketsInput> = {
  label: "Text to check",
  placeholder: "if (a[i] > 0) { x = 1; }",
  help: `Up to ${BRACKETS_MAX_LENGTH} plain characters. Brackets ( ) [ ] { } are checked; everything else is skipped.`,
  maxLength: 200,
  parse: parseBrackets,
  format: (v) => v.text,
  presets: BRACKETS_PRESETS,
};

function describeBrackets(s: BracketsState): string {
  const stack = s.stack.length ? `Stack, bottom to top: ${s.stack.map((e) => e.ch).join(" ")}.` : "The stack is empty.";
  const verdict = s.verdict ? ` Result: ${s.verdict}.` : "";
  return `Text "${s.chars.map((c) => c.ch).join("")}", ${s.pos} of ${s.chars.length} characters read. ${stack}${verdict}`;
}

export const stackBracketsModel: VizModel<BracketsState, BracketsInput> = {
  id: "stack.brackets",
  title: "Bracket matching with a stack",
  generate: generateBrackets,
  describe: describeBrackets,
  ids: (s) => [...s.chars.map((c) => c.id), ...s.stack.map((e) => e.id), ...(s.popped ? [s.popped.id] : [])],
  defaultInput: BRACKETS_DEFAULT,
  input: bracketsInput,
  lineIds: BRACKETS_LINES,
  counters: ["reads", "comparisons"],
};

export function bracketsTable(s: BracketsState) {
  const open = new Set(s.stack.map((e) => e.index));
  return {
    caption: `Characters read: ${s.pos} of ${s.chars.length}; stack size ${s.stack.length}`,
    columns: ["Index", "Character", "Status"],
    rows: s.chars.map((c, k): (string | number)[] => [
      k,
      c.ch === " " ? "space" : c.ch,
      open.has(k) ? "on the stack" : k < s.pos ? "read" : "not read yet",
    ]),
  };
}

// ------------------------------------------------------------ stack.monotonic

export function formatMono(v: MonoInput): string {
  return v.values.join(", ");
}

export function parseMono(raw: string): ParseResult<MonoInput> {
  const r = parseIntList(raw, { min: MONO_MIN, max: MONO_MAX, maxCount: MONO_MAX_VALUES });
  return r.ok ? { ok: true, value: { values: r.value } } : r;
}

const monoInput: InputSpec<MonoInput> = {
  label: "Numbers",
  placeholder: "9, 4, 2, 3, 7, 6, 8, 1",
  help: `Up to ${MONO_MAX_VALUES} whole numbers from ${MONO_MIN} to ${MONO_MAX}, comma separated.`,
  maxLength: 200,
  parse: parseMono,
  format: formatMono,
  presets: MONO_PRESETS,
};

function describeMono(s: MonoState): string {
  const ans = s.answers.map((x, k) => `${k}: ${x === null ? "?" : x}`).join(", ");
  const stack = s.stack.length ? s.stack.map((j) => `${j} (${s.items[j]?.value})`).join(", ") : "empty";
  return `Values ${s.items.map((it) => it.value).join(", ")}. Next greater so far: ${ans}. Stack of indices, bottom to top: ${stack}. ${s.pushes} pushes, ${s.pops} pops.`;
}

export const stackMonotonicModel: VizModel<MonoState, MonoInput> = {
  id: "stack.monotonic",
  title: "Next greater element with a monotonic stack",
  generate: generateMonotonic,
  describe: describeMono,
  ids: (s) => [
    ...s.items.map((it) => it.id),
    ...s.items.map((_, k) => monoAnswerId(k)),
    ...s.stack.map(monoEntryId),
    ...s.popped.map(monoEntryId),
  ],
  defaultInput: MONO_DEFAULT,
  input: monoInput,
  lineIds: MONO_LINES,
  counters: ["comparisons"],
};

export function monoTable(s: MonoState) {
  const on = new Set(s.stack);
  return {
    caption: `Next greater element: ${s.pushes} pushes, ${s.pops} pops so far`,
    columns: ["Index", "Value", "Next greater", "On the stack"],
    rows: s.items.map((it, k): (string | number)[] => [k, it.value, s.answers[k] ?? "?", on.has(k) ? "yes" : ""]),
  };
}
