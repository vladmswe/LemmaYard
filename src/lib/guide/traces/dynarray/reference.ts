// Obviously-correct dynamic array used only by tests: a JS array holds the
// elements, and the capacity follows the stated policy rule by rule.
import type { DynInput } from "./types";

export interface DynRefStep {
  readonly ok: boolean; // false = pop on empty
  readonly value: number | null; // popped value
  readonly list: readonly number[]; // elements after the op
  readonly capacity: number;
  readonly copies: number; // elements copied by this op's resize (0 if none)
  readonly resized: boolean;
}

export function runDynRef(input: DynInput): DynRefStep[] {
  const list: number[] = [];
  let capacity: number = input.initialCapacity;
  const steps: DynRefStep[] = [];
  for (const op of input.ops) {
    if (op.kind === "append") {
      let copies = 0;
      let resized = false;
      if (list.length === capacity) {
        copies = list.length; // every element moves to the new buffer
        resized = true;
        capacity = input.growth === 2 ? capacity * 2 : Math.max(capacity + 1, Math.floor(capacity * 1.5));
      }
      list.push(op.value);
      steps.push({ ok: true, value: null, list: list.slice(), capacity, copies, resized });
      continue;
    }
    if (list.length === 0) {
      steps.push({ ok: false, value: null, list: [], capacity, copies: 0, resized: false });
      continue;
    }
    const value = list.pop() as number;
    const share = input.shrink === "quarter" ? 4 : 2; // shrink when size <= capacity / share
    const half = Math.floor(capacity / 2);
    let copies = 0;
    let resized = false;
    if (list.length * share <= capacity && half >= input.initialCapacity) {
      capacity = half;
      copies = list.length;
      resized = true;
    }
    steps.push({ ok: true, value, list: list.slice(), capacity, copies, resized });
  }
  return steps;
}
