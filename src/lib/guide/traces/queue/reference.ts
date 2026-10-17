// Obviously-correct queues used only by tests: a JS array holds the values in
// order; the ring's capacity follows the doubling rule separately.
import { RING_START_CAPACITY, type QueueInput } from "./types";

export interface QueueRefStep {
  readonly ok: boolean; // false = dequeue or peek on an empty queue
  readonly value: number | null; // returned by dequeue / peek
  readonly list: readonly number[]; // front to back, after the op
  /** Plain list: values that moved one slot left (size - 1 for a dequeue). */
  readonly naiveMoves: number;
  /** Ring: capacity after the op and the values a grow copied. */
  readonly capacity: number;
  readonly ringCopies: number;
}

export function runQueueRef(input: QueueInput, startCapacity = RING_START_CAPACITY): QueueRefStep[] {
  const list: number[] = [];
  let capacity = startCapacity;
  return input.ops.map((op) => {
    if (op.kind === "enqueue") {
      let ringCopies = 0;
      if (list.length === capacity) {
        ringCopies = list.length;
        capacity *= 2;
      }
      list.push(op.value);
      return { ok: true, value: null, list: list.slice(), naiveMoves: 0, capacity, ringCopies };
    }
    if (list.length === 0) return { ok: false, value: null, list: [], naiveMoves: 0, capacity, ringCopies: 0 };
    if (op.kind === "peek") return { ok: true, value: list[0] as number, list: list.slice(), naiveMoves: 0, capacity, ringCopies: 0 };
    const value = list.shift() as number;
    return { ok: true, value, list: list.slice(), naiveMoves: list.length, capacity, ringCopies: 0 };
  });
}
