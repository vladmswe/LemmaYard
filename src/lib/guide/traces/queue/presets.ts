import type { InputPreset } from "../../contracts";
import { mulberry32, randomInt } from "../../random";

import type { QueueInput, QueueOp } from "./types";

const enq = (values: readonly number[]): QueueOp[] => values.map((value) => ({ kind: "enqueue", value }));
const deq = (count: number): QueueOp[] => Array.from({ length: count }, () => ({ kind: "dequeue" }));
const PEEK: QueueOp = { kind: "peek" };

/**
 * Ring default and the "same script, both ways" preset: fill 7 slots, take 6
 * out (head = 6), then 80 lands in slot 7, 90 wraps to slot 0 and 100 goes
 * to (6 + 3) % 8 = 1.
 */
const SAME_SCRIPT: QueueInput = { ops: [...enq([10, 20, 30, 40, 50, 60, 70]), ...deq(6), ...enq([80, 90, 100])] };

export const QUEUE_RING_DEFAULT: QueueInput = SAME_SCRIPT;

/** Naive default: a few appends, then dequeues that shift everything behind the front. */
export const QUEUE_NAIVE_DEFAULT: QueueInput = { ops: [...enq([10, 20, 30, 40]), ...deq(2), ...enq([50]), PEEK, ...deq(1)] };

export const QUEUE_PRESETS: readonly InputPreset<QueueInput>[] = [
  { id: "same-script", label: "Same script, both ways", value: SAME_SCRIPT },
  { id: "fill-up", label: "Fill all 8 slots", value: { ops: [...enq([10, 20, 30, 40, 50, 60, 70, 80]), ...deq(3), PEEK] } },
  {
    id: "grow-wrapped",
    label: "Grow a wrapped ring",
    value: { ops: [...enq([1, 2, 3]), ...deq(3), ...enq([10, 20, 30, 40, 50, 60, 70, 80, 90])] },
  },
  { id: "empty", label: "Dequeue and peek on empty", value: { ops: [...deq(1), PEEK, ...enq([5]), ...deq(2)] } },
];

/** "Random" preset: 8..16 ops, about two enqueues per dequeue. */
export function randomQueueInput(seed: number): QueueInput {
  const rng = mulberry32(seed);
  const count = randomInt(rng, 8, 16);
  const ops: QueueOp[] = [];
  for (let k = 0; k < count; k++) {
    const r = rng();
    ops.push(r < 0.6 ? { kind: "enqueue", value: randomInt(rng, 1, 99) } : r < 0.9 ? { kind: "dequeue" } : PEEK);
  }
  return { ops };
}
