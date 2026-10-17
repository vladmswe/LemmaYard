// Obviously-correct deque used only by tests: a JS array with unshift / push /
// shift / pop; the ring's capacity follows the doubling rule separately.
import { RING_START_CAPACITY } from "../queue/types";

import type { DequeInput } from "./types";

export interface DequeRefStep {
  readonly ok: boolean; // false = pop on an empty deque
  readonly value: number | null; // returned by a pop
  readonly list: readonly number[]; // front to back, after the op
  readonly capacity: number;
  readonly copies: number; // values a grow copied
}

export function runDequeRef(input: DequeInput, startCapacity = RING_START_CAPACITY): DequeRefStep[] {
  const list: number[] = [];
  let capacity = startCapacity;
  return input.ops.map((op) => {
    if (op.kind === "pushFront" || op.kind === "pushBack") {
      let copies = 0;
      if (list.length === capacity) {
        copies = list.length;
        capacity *= 2;
      }
      if (op.kind === "pushFront") list.unshift(op.value);
      else list.push(op.value);
      return { ok: true, value: null, list: list.slice(), capacity, copies };
    }
    if (list.length === 0) return { ok: false, value: null, list: [], capacity, copies: 0 };
    const value = (op.kind === "popFront" ? list.shift() : list.pop()) as number;
    return { ok: true, value, list: list.slice(), capacity, copies: 0 };
  });
}
