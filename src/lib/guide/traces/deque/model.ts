// Visualization "deque.ring" (lesson queues-and-deques): a double-ended queue
// in the same circular buffer as queue.ring. pushFront moves head backwards
// with (head - 1 + capacity) % capacity; popBack reads (head + size - 1) % capacity.
//
// Snippet `queues-and-deques/ring_deque` (Python / JavaScript; the JS method
// names are camelCase):
//   deque.pushBack.full    if self._size == len(self._data):   (in push_back)
//   deque.pushBack.write   self._data[(self._head + self._size) % len(self._data)] = value
//   deque.pushFront.full   if self._size == len(self._data):   (in push_front)
//   deque.pushFront.write  self._head = (self._head - 1 + len(self._data)) % len(self._data)
//   deque.popFront.empty   if self._size == 0:                 (in pop_front)
//   deque.popFront.read    value = self._data[self._head]
//   deque.popBack.empty    if self._size == 0:                 (in pop_back)
//   deque.popBack.read     value = self._data[(self._head + self._size - 1) % len(self._data)]
//   deque.grow.alloc       self._data = [None] * (2 * cap)
//   deque.grow.copy        self._data[i] = old[(self._head + i) % cap]
//   deque.grow.done        self._head = 0
import type { InputSpec, ParseResult, VizModel } from "../../contracts";
import { parseOpScript } from "../../input/parsers";
import { describeRing, generateRing, ringIds, type RingConfig, type RingOp } from "../queue/model";
import { RING_START_CAPACITY, type RingState } from "../queue/types";

import { DEQUE_DEFAULT, DEQUE_PRESETS } from "./presets";
import {
  DEQUE_LINES,
  DEQUE_MAX,
  DEQUE_MAX_OPS,
  DEQUE_MIN,
  dequeOpLabel,
  type DequeInput,
  type DequeOp,
  type DequeOpKind,
} from "./types";

export * from "./types";

export const DEQUE_RING_CONFIG: RingConfig = {
  vizId: "deque.ring",
  noun: "deque",
  capacity: RING_START_CAPACITY,
  lines: {
    pushBackFull: "deque.pushBack.full",
    pushBackWrite: "deque.pushBack.write",
    pushFrontFull: "deque.pushFront.full",
    pushFrontWrite: "deque.pushFront.write",
    popFrontEmpty: "deque.popFront.empty",
    popFrontRead: "deque.popFront.read",
    popBackEmpty: "deque.popBack.empty",
    popBackRead: "deque.popBack.read",
    growAlloc: "deque.grow.alloc",
    growCopy: "deque.grow.copy",
    growDone: "deque.grow.done",
  },
  prompts: { frontWrap: true, full: true },
  verbs: { pushBack: "pushBack", pushFront: "pushFront", popFront: "popFront", popBack: "popBack", peekFront: "peekFront" },
};

export function toDequeRingOps(ops: readonly DequeOp[]): RingOp[] {
  return ops.map((o) => ("value" in o ? { kind: o.kind, value: o.value, label: dequeOpLabel(o) } : { kind: o.kind, label: dequeOpLabel(o) }));
}

const NAMES: Readonly<Record<string, DequeOpKind>> = {
  pushfront: "pushFront",
  pushback: "pushBack",
  popfront: "popFront",
  popback: "popBack",
};

export function formatDeque(v: DequeInput): string {
  return v.ops.map(dequeOpLabel).join(", ");
}

export function parseDeque(raw: string): ParseResult<DequeInput> {
  // parseOpScript matches op names case-insensitively against lower-case keys.
  const r = parseOpScript(raw, { pushfront: ["int"], pushback: ["int"], popfront: [], popback: [] } as const, {
    min: DEQUE_MIN,
    max: DEQUE_MAX,
    maxOps: DEQUE_MAX_OPS,
  });
  if (!r.ok) {
    const error = r.error
      .replace("pushfront, pushback, popfront, popback", "pushFront, pushBack, popFront, popBack")
      .replace(/'(push|pop)(front|back)'/, (_, a: string, b: string) => `'${a}${b[0]!.toUpperCase()}${b.slice(1)}'`);
    return { ok: false, error };
  }
  return {
    ok: true,
    value: {
      ops: r.value.map((c): DequeOp => {
        const kind = NAMES[c.op] as DequeOpKind;
        return kind === "pushFront" || kind === "pushBack" ? { kind, value: c.args[0] as number } : { kind };
      }),
    },
  };
}

const dequeInput: InputSpec<DequeInput> = {
  label: "Deque ops",
  placeholder: "pushBack 1, pushFront 2, popBack, popFront",
  help: `Up to ${DEQUE_MAX_OPS} ops, comma separated: pushFront <number>, pushBack <number>, popFront or popBack. Numbers from ${DEQUE_MIN} to ${DEQUE_MAX}.`,
  maxLength: 200,
  parse: parseDeque,
  format: formatDeque,
  presets: DEQUE_PRESETS,
};

export const dequeRingModel: VizModel<RingState, DequeInput> = {
  id: "deque.ring",
  title: "Deque in a circular buffer",
  generate: (input) => generateRing(toDequeRingOps(input.ops), DEQUE_RING_CONFIG),
  describe: (s) => describeRing(s, "deque"),
  ids: ringIds,
  defaultInput: DEQUE_DEFAULT,
  input: dequeInput,
  lineIds: DEQUE_LINES,
  counters: ["writes", "reads", "moves"],
};
