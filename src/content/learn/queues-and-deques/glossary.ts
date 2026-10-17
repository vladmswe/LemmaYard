import type { GlossaryEntry } from "@/lib/guide/content/types";

export const glossary: readonly GlossaryEntry[] = [
  {
    id: "queue",
    term: "Queue",
    definition: "A collection that adds at the back (tail) and removes at the front (head), so values leave in the order they arrived.",
  },
  {
    id: "fifo",
    term: "FIFO",
    definition: "First in, first out: the value that has waited longest is removed first. The rule of a queue.",
  },
  {
    id: "enqueue",
    term: "Enqueue and dequeue",
    definition: "Enqueue adds a value at the back of a queue; dequeue removes the value at the front and returns it, and fails on an empty queue.",
  },
  {
    id: "circular-buffer",
    term: "Circular buffer",
    definition: "A fixed array used as a ring: head and size locate the values, and indices wrap around with a modulo. Also called a ring buffer.",
  },
  {
    id: "wrap-around",
    term: "Wrap-around",
    definition: "Stepping from the last slot of a circular buffer back to slot 0, computed as (index + 1) % capacity.",
  },
  {
    id: "unroll",
    term: "Unroll (a ring)",
    definition: "Copy a circular buffer into a new array in queue order, old[(head + i) % oldCapacity] into slot i, so the front ends up at slot 0.",
  },
  {
    id: "deque",
    term: "Deque",
    definition: "A double-ended queue: push and pop at both the front and the back, each O(1) amortized in a circular buffer.",
  },
];
