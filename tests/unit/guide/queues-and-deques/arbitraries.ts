// Op-script arbitraries shared by the queue and deque tests. The threshold
// scripts (S2a) are biased to reach a full ring, the grow, the wrap past the
// last slot (both directions) and pops on an empty structure.
import fc from "fast-check";

import type { DequeInput, DequeOp } from "@/lib/guide/traces/deque";
import { QUEUE_MAX_OPS, type QueueInput, type QueueOp } from "@/lib/guide/traces/queue";

export const valueArb = fc.integer({ min: -99, max: 999 });

const enqueueArb: fc.Arbitrary<QueueOp> = fc.record({ kind: fc.constant("enqueue" as const), value: valueArb });
export const queueOpArb: fc.Arbitrary<QueueOp> = fc.oneof(
  { weight: 5, arbitrary: enqueueArb },
  { weight: 3, arbitrary: fc.constant({ kind: "dequeue" as const }) },
  { weight: 1, arbitrary: fc.constant({ kind: "peek" as const }) },
);
/** Within the input caps (16 ops). */
export const queueInputArb: fc.Arbitrary<QueueInput> = fc.record({ ops: fc.array(queueOpArb, { minLength: 1, maxLength: QUEUE_MAX_OPS }) });

const enq = (n: number): QueueOp[] => Array.from({ length: n }, (_, k) => ({ kind: "enqueue", value: 10 * (k + 1) }));
const deq = (n: number): QueueOp[] => Array.from({ length: n }, () => ({ kind: "dequeue" }));

/**
 * Fill to `a`, take `b` out (head moves to b, past the end when b >= 8 - ...),
 * fill `c` more (wraps, can fill the ring and grow it), then a mixed tail.
 * Up to 30 ops: longer than the input cap on purpose, the generator has none.
 */
export const queueBoundaryArb: fc.Arbitrary<QueueInput> = fc
  .record({
    a: fc.integer({ min: 0, max: 8 }),
    b: fc.integer({ min: 0, max: 9 }),
    c: fc.integer({ min: 0, max: 10 }),
    tail: fc.array(queueOpArb, { maxLength: 4 }),
  })
  .map(({ a, b, c, tail }) => ({ ops: [...enq(a), ...deq(b), ...enq(c), ...tail] }))
  .filter((v) => v.ops.length > 0);

export const dequeOpArb: fc.Arbitrary<DequeOp> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("pushFront" as const), value: valueArb }) },
  { weight: 3, arbitrary: fc.record({ kind: fc.constant("pushBack" as const), value: valueArb }) },
  { weight: 2, arbitrary: fc.constant({ kind: "popFront" as const }) },
  { weight: 2, arbitrary: fc.constant({ kind: "popBack" as const }) },
);
export const dequeInputArb: fc.Arbitrary<DequeInput> = fc.record({ ops: fc.array(dequeOpArb, { minLength: 1, maxLength: 16 }) });

/** Pushes from one end or both up to and past a full ring, then pops from either end until past empty. */
export const dequeBoundaryArb: fc.Arbitrary<DequeInput> = fc
  .record({
    front: fc.integer({ min: 0, max: 9 }),
    back: fc.integer({ min: 0, max: 9 }),
    pops: fc.array(fc.constantFrom("popFront" as const, "popBack" as const), { maxLength: 12 }),
    tail: fc.array(dequeOpArb, { maxLength: 4 }),
  })
  .map(({ front, back, pops, tail }) => ({
    ops: [
      ...Array.from({ length: front }, (_, k): DequeOp => ({ kind: "pushFront", value: k + 1 })),
      ...Array.from({ length: back }, (_, k): DequeOp => ({ kind: "pushBack", value: 100 + k })),
      ...pops.map((kind): DequeOp => ({ kind })),
      ...tail,
    ],
  }))
  .filter((v) => v.ops.length > 0);
