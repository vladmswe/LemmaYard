import type { ElementId } from "../../contracts";

export interface ArrayItem {
  readonly id: ElementId;
  readonly value: number;
}

export interface ArrayState {
  readonly capacity: number;
  /** One entry per slot; null = empty (or the gap a shift leaves for a moment). */
  readonly slots: readonly (ArrayItem | null)[];
  readonly size: number;
  /** Op in progress or just finished, e.g. "insert 1 7"; null on the first and last frame. */
  readonly op: string | null;
  /** Number of ops finished so far (failed ones included). */
  readonly completed: number;
}

export type ArrayOp =
  | { readonly kind: "insert"; readonly index: number; readonly value: number }
  | { readonly kind: "remove"; readonly index: number };

export interface ArrayInput {
  readonly values: readonly number[];
  readonly ops: readonly ArrayOp[];
}

export const ARRAY_ID: ElementId = "arr";
export const ARRAY_CAPACITY = 10;
export const ARRAY_MAX_OPS = 8;
export const ARRAY_MIN = -99;
export const ARRAY_MAX = 999;

export const ARRAY_LINES = [
  "array.insert.full",
  "array.insert.range",
  "array.insert.shift",
  "array.insert.write",
  "array.remove.range",
  "array.remove.read",
  "array.remove.shift",
  "array.remove.clear",
] as const;

export function opLabel(op: ArrayOp): string {
  return op.kind === "insert" ? `insert ${op.index} ${op.value}` : `remove ${op.index}`;
}

