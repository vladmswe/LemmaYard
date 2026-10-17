export type DequeOpKind = "pushFront" | "pushBack" | "popFront" | "popBack";
export type DequeOp =
  | { readonly kind: "pushFront" | "pushBack"; readonly value: number }
  | { readonly kind: "popFront" | "popBack" };

export interface DequeInput {
  readonly ops: readonly DequeOp[];
}

export const DEQUE_MAX_OPS = 16;
export const DEQUE_MIN = -99;
export const DEQUE_MAX = 999;

export const DEQUE_LINES = [
  "deque.pushBack.full",
  "deque.pushBack.write",
  "deque.pushFront.full",
  "deque.pushFront.write",
  "deque.popFront.empty",
  "deque.popFront.read",
  "deque.popBack.empty",
  "deque.popBack.read",
  "deque.grow.alloc",
  "deque.grow.copy",
  "deque.grow.done",
] as const;

export function dequeOpLabel(op: DequeOp): string {
  return "value" in op ? `${op.kind} ${op.value}` : op.kind;
}
