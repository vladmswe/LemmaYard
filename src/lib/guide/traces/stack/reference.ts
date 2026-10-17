// Obviously-correct stack algorithms used only by tests.
import { CLOSERS, OPENERS, STACK_START_CAPACITY, type StackInput } from "./types";

export interface StackRefStep {
  readonly ok: boolean; // false = pop or peek on an empty stack
  readonly value: number | null; // returned by pop / peek
  readonly list: readonly number[]; // bottom to top, after the op
  readonly capacity: number;
  readonly copies: number; // values copied by this op's growth
}

/** A JS array is the stack; the capacity doubles from 4 whenever a push finds it full. */
export function runStackRef(input: StackInput): StackRefStep[] {
  const list: number[] = [];
  let capacity = STACK_START_CAPACITY;
  return input.ops.map((op) => {
    if (op.kind === "push") {
      let copies = 0;
      if (list.length === capacity) {
        copies = list.length;
        capacity *= 2;
      }
      list.push(op.value);
      return { ok: true, value: null, list: list.slice(), capacity, copies };
    }
    if (list.length === 0) return { ok: false, value: null, list: [], capacity, copies: 0 };
    const value = op.kind === "pop" ? (list.pop() as number) : (list.at(-1) as number);
    return { ok: true, value, list: list.slice(), capacity, copies: 0 };
  });
}

/**
 * Brackets left after deleting adjacent matching pairs ("()", "[]", "{}") over
 * and over, ignoring every other character. Balanced iff nothing is left.
 */
export function reduceBrackets(text: string): string {
  let s = Array.from(text)
    .filter((ch) => OPENERS.includes(ch) || CLOSERS.includes(ch))
    .join("");
  for (;;) {
    const t = s.replace(/\(\)|\[\]|\{\}/g, "");
    if (t === s) return s;
    s = t;
  }
}

export function refBalanced(text: string): boolean {
  return reduceBrackets(text) === "";
}

/** The unmatched openers of a prefix with no error so far (bottom to top), or null if it already failed. */
export function refOpenAfter(prefix: string): string | null {
  const left = reduceBrackets(prefix);
  return Array.from(left).every((ch) => OPENERS.includes(ch)) ? left : null;
}

/** O(n^2) next greater element: for each i, the first later value that is larger, else -1. */
export function refNextGreater(values: readonly number[]): number[] {
  return values.map((v, i) => {
    for (let j = i + 1; j < values.length; j++) if ((values[j] as number) > v) return values[j] as number;
    return -1;
  });
}
