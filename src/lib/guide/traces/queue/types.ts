import type { ElementId } from "../../contracts";

export type QueueOp = { readonly kind: "enqueue"; readonly value: number } | { readonly kind: "dequeue" } | { readonly kind: "peek" };

/** The same op script drives both queue.naive and queue.ring. */
export interface QueueInput {
  readonly ops: readonly QueueOp[];
}

export const QUEUE_MAX_OPS = 16;
export const QUEUE_MIN = -99;
export const QUEUE_MAX = 999;

export function queueOpLabel(op: QueueOp): string {
  return op.kind === "enqueue" ? `enqueue ${op.value}` : op.kind;
}

// ------------------------------------------------------------ queue.naive

export interface NaiveItem {
  readonly id: ElementId; // "e<k>": the k-th enqueued value; keeps its id while it shifts
  readonly value: number;
}

export interface NaiveState {
  /** The queue, front first. While `gap` is true they still sit one slot to the right. */
  readonly items: readonly NaiveItem[];
  /** The value a dequeue just took, drawn faded at index 0. */
  readonly removed: NaiveItem | null;
  readonly gap: boolean;
  readonly op: string | null;
  readonly out: number | "error" | null;
  readonly completed: number;
}

export const NAIVE_ID: ElementId = "list";

export const NAIVE_LINES = [
  "naive.enqueue",
  "naive.dequeue.empty",
  "naive.dequeue.read",
  "naive.dequeue.shift",
  "naive.peek.empty",
  "naive.peek.read",
] as const;

// ------------------------------------------------------------ ring buffer (queue.ring, deque.ring)

export interface RingSlot {
  readonly id: ElementId; // "<buffer id>s<slot>"
  readonly value: number | null;
}

export interface RingBuffer {
  readonly id: ElementId; // "r0", "r1", ... one per allocation
  readonly capacity: number;
  readonly slots: readonly RingSlot[];
}

export interface RingState {
  readonly buffer: RingBuffer;
  /** The new buffer while a grow copies into it; null otherwise. */
  readonly next: RingBuffer | null;
  readonly head: number; // 0 <= head < capacity
  readonly size: number; // 0 <= size <= capacity
  /** Slot a pop just emptied: its old value is still drawn, faded. */
  readonly cleared: number | null;
  readonly op: string | null;
  readonly out: number | "error" | null;
  readonly completed: number;
}

export const RING_START_CAPACITY = 8;

/** The values in queue order: slots head, head + 1, ... (mod capacity). */
export function ringValues(s: Pick<RingState, "buffer" | "head" | "size">): number[] {
  const cap = s.buffer.capacity;
  return Array.from({ length: s.size }, (_, i) => s.buffer.slots[(s.head + i) % cap]?.value as number);
}

export const QUEUE_RING_LINES = [
  "queue.enqueue.full",
  "queue.enqueue.write",
  "queue.dequeue.empty",
  "queue.dequeue.read",
  "queue.peek.empty",
  "queue.peek.read",
  "queue.grow.alloc",
  "queue.grow.copy",
  "queue.grow.done",
] as const;
