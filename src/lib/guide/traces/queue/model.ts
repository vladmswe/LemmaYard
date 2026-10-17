// Visualizations of the queues lesson, both driven by the same op script:
//
// "queue.naive": a queue in a plain list whose dequeue shifts every remaining
// value (moves = size - 1 per dequeue). No snippet is bound to it; the lesson
// shows list.pop(0) / shift() in prose.
//
// "queue.ring": a circular buffer of 8 slots that doubles when full.
// Snippet `queues-and-deques/ring_queue` (Python / JavaScript):
//   queue.enqueue.full   if self._size == len(self._data):            if (this.size === this.data.length) this.grow();
//   queue.enqueue.write  tail = (self._head + self._size) % len(...)  const tail = (this.head + this.size) % this.data.length;
//   queue.dequeue.empty  if self._size == 0:  (in dequeue)            if (this.size === 0) throw ...  (in dequeue)
//   queue.dequeue.read   value = self._data[self._head]               const value = this.data[this.head];
//   queue.peek.empty     if self._size == 0:  (in peek)               if (this.size === 0) throw ...  (in peek)
//   queue.peek.read      return self._data[self._head]                return this.data[this.head];
//   queue.grow.alloc     self._data = [None] * (2 * cap)              this.data = new Array(2 * cap).fill(null);
//   queue.grow.copy      self._data[i] = old[(self._head + i) % cap]  this.data[i] = old[(this.head + i) % cap];
//   queue.grow.done      self._head = 0                               this.head = 0;
import type { InputSpec, ParseResult, VizModel } from "../../contracts";
import { parseOpScript } from "../../input/parsers";

import { generateNaive } from "./naive";
import { QUEUE_NAIVE_DEFAULT, QUEUE_PRESETS, QUEUE_RING_DEFAULT } from "./presets";
import { generateRing, type RingConfig, type RingOp } from "./ring";
import {
  NAIVE_ID,
  NAIVE_LINES,
  QUEUE_MAX,
  QUEUE_MAX_OPS,
  QUEUE_MIN,
  QUEUE_RING_LINES,
  RING_START_CAPACITY,
  queueOpLabel,
  ringValues,
  type NaiveState,
  type QueueInput,
  type QueueOp,
  type RingState,
} from "./types";

export * from "./types";
export type { NaiveResult } from "./naive";
export type { RingResult, RingOp, RingConfig } from "./ring";
export { generateRing } from "./ring";

export function formatQueue(v: QueueInput): string {
  return v.ops.map(queueOpLabel).join(", ");
}

export function parseQueue(raw: string): ParseResult<QueueInput> {
  const r = parseOpScript(raw, { enqueue: ["int"], dequeue: [], peek: [] } as const, {
    min: QUEUE_MIN,
    max: QUEUE_MAX,
    maxOps: QUEUE_MAX_OPS,
  });
  if (!r.ok) return r;
  return {
    ok: true,
    value: {
      ops: r.value.map((c): QueueOp => (c.op === "enqueue" ? { kind: "enqueue", value: c.args[0] as number } : { kind: c.op })),
    },
  };
}

const queueInput: InputSpec<QueueInput> = {
  label: "Queue ops",
  placeholder: "enqueue 10, enqueue 20, dequeue, peek",
  help: `Up to ${QUEUE_MAX_OPS} ops, comma separated: enqueue <number>, dequeue or peek. Numbers from ${QUEUE_MIN} to ${QUEUE_MAX}.`,
  maxLength: 200,
  parse: parseQueue,
  format: formatQueue,
  presets: QUEUE_PRESETS,
};

function outText(out: number | "error" | null): string {
  return out === null ? "" : out === "error" ? " The last dequeue or peek failed." : ` Last returned value: ${out}.`;
}

// ------------------------------------------------------------ queue.naive

function describeNaive(s: NaiveState): string {
  const list = s.items.length ? `Front to back: ${s.items.map((it) => it.value).join(", ")}.` : "The list is empty.";
  const gap = s.gap ? ` Index 0 is empty for a moment after ${s.removed?.value} left; the rest still sit one slot to the right.` : "";
  return `Queue in a plain list of ${s.items.length} values. ${list}${gap}${outText(s.out)}`;
}

export const queueNaiveModel: VizModel<NaiveState, QueueInput> = {
  id: "queue.naive",
  title: "Queue in a plain list",
  generate: generateNaive,
  describe: describeNaive,
  ids: (s) => [NAIVE_ID, ...(s.removed ? [s.removed.id] : []), ...s.items.map((it) => it.id)],
  defaultInput: QUEUE_NAIVE_DEFAULT,
  input: queueInput,
  lineIds: NAIVE_LINES,
  counters: ["writes", "reads", "moves"],
};

export function naiveTable(s: NaiveState) {
  const rows: (string | number)[][] = [];
  if (s.gap && s.removed) rows.push([0, s.removed.value, "just dequeued"]);
  s.items.forEach((it, k) => rows.push([k + (s.gap ? 1 : 0), it.value, k === 0 && !s.gap ? "front" : ""]));
  return { caption: `Plain-list queue, ${s.items.length} values`, columns: ["Index", "Value", "Note"], rows };
}

// ------------------------------------------------------------ queue.ring

export const QUEUE_RING_CONFIG: RingConfig = {
  vizId: "queue.ring",
  noun: "queue",
  capacity: RING_START_CAPACITY,
  lines: {
    pushBackFull: "queue.enqueue.full",
    pushBackWrite: "queue.enqueue.write",
    popFrontEmpty: "queue.dequeue.empty",
    popFrontRead: "queue.dequeue.read",
    peekEmpty: "queue.peek.empty",
    peekRead: "queue.peek.read",
    growAlloc: "queue.grow.alloc",
    growCopy: "queue.grow.copy",
    growDone: "queue.grow.done",
  },
  prompts: { wrapSlot: true, full: true },
  verbs: { pushBack: "Enqueue", pushFront: "Enqueue", popFront: "Dequeue", popBack: "Dequeue", peekFront: "Peek" },
};

export function toRingOps(ops: readonly QueueOp[]): RingOp[] {
  return ops.map((o) =>
    o.kind === "enqueue"
      ? { kind: "pushBack", value: o.value, label: queueOpLabel(o) }
      : { kind: o.kind === "dequeue" ? "popFront" : "peekFront", label: queueOpLabel(o) },
  );
}

export function describeRing(s: RingState, noun: "queue" | "deque" = "queue"): string {
  const cap = s.buffer.capacity;
  const slots = s.buffer.slots.map((sl, k) => `${k}: ${sl.value === null || k === s.cleared ? "empty" : sl.value}`).join(", ");
  const values = ringValues(s);
  const order = values.length ? ` Head to tail: ${values.join(", ")}.` : ` The ${noun} is empty.`;
  const next = s.next
    ? ` New buffer of ${s.next.capacity} slots being filled: ${s.next.slots.filter((x) => x.value !== null).map((x) => x.value).join(", ")}.`
    : "";
  return `Ring of ${cap} slots, head = ${s.head}, size = ${s.size}, tail = ${(s.head + s.size) % cap}. Slots ${slots}.${order}${next}${outText(s.out)}`;
}

export const queueRingModel: VizModel<RingState, QueueInput> = {
  id: "queue.ring",
  title: "Queue in a circular buffer",
  generate: (input) => generateRing(toRingOps(input.ops), QUEUE_RING_CONFIG),
  describe: (s) => describeRing(s, "queue"),
  ids: ringIds,
  defaultInput: QUEUE_RING_DEFAULT,
  input: queueInput,
  lineIds: QUEUE_RING_LINES,
  counters: ["writes", "reads", "moves"],
};

export function ringIds(s: RingState): string[] {
  const out = [s.buffer.id, ...s.buffer.slots.map((x) => x.id)];
  if (s.next) out.push(s.next.id, ...s.next.slots.map((x) => x.id));
  return out;
}

export function ringTable(s: RingState) {
  const cap = s.buffer.capacity;
  const tail = (s.head + s.size) % cap;
  const rows = s.buffer.slots.map((sl, k): (string | number)[] => [
    k,
    sl.value === null ? "" : k === s.cleared ? `${sl.value} (just removed)` : sl.value,
    [k === s.head ? "head" : "", k === tail ? "tail" : ""].filter(Boolean).join(", "),
    s.next ? (s.next.slots[k]?.value ?? "") : "",
  ]);
  if (s.next) for (let k = cap; k < s.next.capacity; k++) rows.push([k, "", "", s.next.slots[k]?.value ?? ""]);
  return {
    caption: `Ring of ${cap} slots: head = ${s.head}, size = ${s.size}, tail = ${tail}`,
    columns: ["Slot", "Value", "Pointers", "New buffer"],
    rows,
  };
}
