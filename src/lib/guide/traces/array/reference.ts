// Obviously-correct fixed-array ops used only by tests (JS splice does the shifting).
import { ARRAY_CAPACITY, type ArrayInput } from "./types";

export interface ArrayRefStep {
  readonly ok: boolean; // false = the op raised an error and changed nothing
  readonly moves: number; // elements that change index
  readonly after: readonly number[]; // logical sequence after the op
}

export function runArrayRef(input: ArrayInput, capacity = ARRAY_CAPACITY): ArrayRefStep[] {
  const list = input.values.slice();
  return input.ops.map((op) => {
    if (op.kind === "insert") {
      if (list.length === capacity || op.index < 0 || op.index > list.length) {
        return { ok: false, moves: 0, after: list.slice() };
      }
      const moves = list.length - op.index;
      list.splice(op.index, 0, op.value);
      return { ok: true, moves, after: list.slice() };
    }
    if (op.index < 0 || op.index >= list.length) return { ok: false, moves: 0, after: list.slice() };
    const moves = list.length - 1 - op.index;
    list.splice(op.index, 1);
    return { ok: true, moves, after: list.slice() };
  });
}
