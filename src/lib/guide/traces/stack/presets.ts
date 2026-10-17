import type { InputPreset } from "../../contracts";
import { mulberry32, randomInt } from "../../random";

import type { BracketsInput, MonoInput, StackInput, StackOp } from "./types";

// ------------------------------------------------------------ stack.ops

const pushes = (values: readonly number[]): StackOp[] => values.map((value) => ({ kind: "push", value }));
const POP: StackOp = { kind: "pop" };
const PEEK: StackOp = { kind: "peek" };

/** Default: the "what is on top?" question, then the stack is emptied and popped once more (error). */
export const STACK_DEFAULT: StackInput = {
  ops: [...pushes([1, 2]), POP, ...pushes([3]), PEEK, POP, POP, POP],
};

export const STACK_PRESETS: readonly InputPreset<StackInput>[] = [
  { id: "short", label: "push 3, push 5, pop, peek", value: { ops: [...pushes([3, 5]), POP, PEEK] } },
  { id: "grow", label: "Push past capacity 4", value: { ops: [...pushes([4, 8, 15, 16, 23, 42]), PEEK, POP] } },
  { id: "empty", label: "Pop and peek on empty", value: { ops: [POP, PEEK, ...pushes([7]), POP, POP] } },
  { id: "reverse", label: "Reverse 1..5", value: { ops: [...pushes([1, 2, 3, 4, 5]), POP, POP, POP, POP, POP] } },
];

/** "Random" preset: 6..12 ops, mostly pushes. */
export function randomStackInput(seed: number): StackInput {
  const rng = mulberry32(seed);
  const count = randomInt(rng, 6, 12);
  const ops: StackOp[] = [];
  for (let k = 0; k < count; k++) {
    const r = rng();
    ops.push(r < 0.55 ? { kind: "push", value: randomInt(rng, 1, 99) } : r < 0.85 ? POP : PEEK);
  }
  return { ops };
}

// ------------------------------------------------------------ stack.brackets

/** The course's "be the compiler" line: balanced, with letters, digits and symbols to skip. */
export const BRACKETS_DEFAULT: BracketsInput = { text: "if (x * (y + z[1]) < 137) { x = 1; }" };

export const BRACKETS_PRESETS: readonly InputPreset<BracketsInput>[] = [
  { id: "nested", label: "((())())()", value: { text: "((())())()" } },
  { id: "closer-first", label: ")()(", value: { text: ")()(" } },
  { id: "extra-closer", label: "())", value: { text: "())" } },
  { id: "crossed", label: "([)]", value: { text: "([)]" } },
  { id: "left-open", label: "((", value: { text: "((" } },
  { id: "no-brackets", label: "No brackets", value: { text: "x = 1" } },
];

const RANDOM_CHARS = "()[]{}ab ";

/** "Random" preset: 8..20 characters over ()[]{}ab and space. */
export function randomBracketsInput(seed: number): BracketsInput {
  const rng = mulberry32(seed);
  const len = randomInt(rng, 8, 20);
  let text = "";
  for (let k = 0; k < len; k++) text += RANDOM_CHARS[randomInt(rng, 0, RANDOM_CHARS.length - 1)];
  return { text };
}

// ------------------------------------------------------------ stack.monotonic

/** Default: when 7 arrives (index 4), indices 1 and 3 pop; 9 at index 0 stays. */
export const MONO_DEFAULT: MonoInput = { values: [9, 4, 2, 3, 7, 6, 8, 1] };

export const MONO_PRESETS: readonly InputPreset<MonoInput>[] = [
  { id: "increasing", label: "Increasing", value: { values: [1, 2, 3, 4, 5, 6] } },
  { id: "decreasing", label: "Decreasing", value: { values: [6, 5, 4, 3, 2, 1] } },
  { id: "equal", label: "Equal values", value: { values: [5, 5, 5, 6] } },
  { id: "temperatures", label: "Temperatures", value: { values: [73, 74, 75, 71, 69, 72, 76, 73] } },
];

/** "Random" preset: 6..12 values from 1 to 20. */
export function randomMonoInput(seed: number): MonoInput {
  const rng = mulberry32(seed);
  const n = randomInt(rng, 6, 12);
  return { values: Array.from({ length: n }, () => randomInt(rng, 1, 20)) };
}
