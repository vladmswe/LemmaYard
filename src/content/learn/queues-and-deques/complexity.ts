import type { ComplexityTableData } from "@/lib/guide/content/types";

export const tables: readonly ComplexityTableData[] = [
  {
    id: "queue-ops",
    caption: "Cost of queue and deque operations (n values stored)",
    rows: [
      {
        op: "enqueue",
        cells: [
          { bound: "O(1)", q: "amortized", cond: "ring" },
          { bound: "O(n)", q: "worst", cond: "growing" },
        ],
        why: "One write at (head + size) % capacity; a full ring first copies its n values (8 moves for the 8-slot ring).",
      },
      {
        op: "dequeue (circular buffer)",
        cells: [{ bound: "O(1)", q: "worst" }],
        why: "Read slot head and move head on with a modulo: the moves counter stays at 0.",
      },
      {
        op: "dequeue (plain list, pop(0) / shift())",
        cells: [{ bound: "O(n)", q: "worst" }],
        why: "Every remaining value moves one slot left: 21 moves for the six dequeues of the shared script.",
      },
      {
        op: "peek",
        cells: [{ bound: "O(1)", q: "worst" }],
        why: "One read at slot head.",
      },
      {
        op: "deque push at either end",
        cells: [
          { bound: "O(1)", q: "amortized" },
          { bound: "O(n)", q: "worst", cond: "growing" },
        ],
        why: "pushFront steps head back with (head - 1 + capacity) % capacity; pushBack writes at the tail. Only a full ring copies.",
      },
      {
        op: "deque pop at either end",
        cells: [{ bound: "O(1)", q: "worst" }],
        why: "popFront reads slot head, popBack reads (head + size - 1) % capacity; nothing moves.",
      },
      {
        op: "queue from two stacks, per op",
        cells: [
          { bound: "O(1)", q: "amortized" },
          { bound: "O(n)", q: "worst", cond: "refill" },
        ],
        why: "Each value moves from the inbox to the outbox at most once.",
      },
    ],
    space: "O(n): a ring that only doubles keeps fewer than 2n slots (or its starting 8)",
  },
];
