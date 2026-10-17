// Generator of "queue.naive": a queue kept in a plain list, front at index 0.
// Enqueue appends; dequeue takes index 0 and then every remaining value moves
// one slot left (Python list.pop(0), JavaScript shift()): size - 1 moves.
import type { Counters, ElementId, Frame, PredictPrompt, Role, Trace } from "../../contracts";

import { NAIVE_ID, queueOpLabel, type NaiveItem, type NaiveState, type QueueInput } from "./types";

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export interface NaiveResult {
  readonly values: number[]; // front to back
  /** One entry per dequeue or peek: the value returned, or null on an empty queue. */
  readonly outputs: (number | null)[];
}

export function generateNaive(input: QueueInput): Trace<NaiveState, NaiveResult> {
  let items: NaiveItem[] = [];
  let removed: NaiveItem | null = null;
  let gap = false;
  let op: string | null = null;
  let out: number | "error" | null = null;
  let completed = 0;
  let nextId = 0;
  let writes = 0;
  let reads = 0;
  let moves = 0;
  let keyLeft = 3;
  let asked = false;
  const outputs: (number | null)[] = [];
  const frames: Frame<NaiveState>[] = [];

  const snap = (): NaiveState => ({ items: items.slice(), removed, gap, op, out, completed });
  const counters = (): Counters => ({ writes, reads, moves });
  const front = () => ({ front: items[0]?.id ?? null });
  const push = (f: Omit<Frame<NaiveState>, "state" | "counters" | "pointers">) =>
    frames.push({ ...f, pointers: front(), state: snap(), counters: counters() });
  const takeKey = (): { key?: true } => (keyLeft-- > 0 ? { key: true } : {});

  push({
    roles: {},
    line: null,
    phase: "Start",
    narration: `We run ${plural(input.ops.length, "op")} on a queue kept in a plain list: the front is index 0, new values go on the end.`,
    key: true,
  });

  for (const o of input.ops) {
    removed = null;
    gap = false;
    op = queueOpLabel(o);
    if (o.kind === "enqueue") {
      const item: NaiveItem = { id: `e${nextId++}`, value: o.value };
      items.push(item);
      writes++;
      completed++;
      push({
        roles: { [item.id]: "new" },
        line: "naive.enqueue",
        phase: "Append at the end",
        narration: `Enqueue ${o.value}: append it at index ${items.length - 1}. No other value moves; size ${items.length}.`,
      });
      continue;
    }
    if (items.length === 0) {
      completed++;
      out = "error";
      outputs.push(null);
      push({
        roles: { [NAIVE_ID]: "error" },
        line: o.kind === "dequeue" ? "naive.dequeue.empty" : "naive.peek.empty",
        phase: o.kind === "dequeue" ? "Dequeue on empty" : "Peek on empty",
        narration: `${o.kind === "dequeue" ? "Dequeue" : "Peek"} fails: the list is empty. Our code raises an error instead of returning nothing.`,
        ...takeKey(),
      });
      continue;
    }
    const first = items[0] as NaiveItem;
    reads++;
    out = first.value;
    outputs.push(first.value);
    if (o.kind === "peek") {
      completed++;
      push({
        roles: { [first.id]: "current" },
        line: "naive.peek.read",
        phase: "Peek at the front",
        narration: `Peek reads ${first.value} at index 0 and changes nothing.`,
      });
      continue;
    }
    // dequeue: take index 0, then close the gap.
    removed = first;
    items = items.slice(1);
    gap = true;
    const rest = items.length;
    push({
      roles: { [first.id]: "removed" },
      line: "naive.dequeue.read",
      phase: "Take the front",
      narration:
        rest === 0
          ? `Dequeue takes ${first.value} from index 0. Nothing stands behind it.`
          : `Dequeue takes ${first.value} from index 0. Index 0 must not stay empty, so the values behind it have to move up.`,
    });
    let prompt: PredictPrompt | undefined;
    // Not when the value itself is the count: the frame on screen names the value.
    if (!asked && rest >= 2 && first.value !== rest) {
      asked = true;
      const vals = [...new Set([1, rest, rest + 1])].sort((a, b) => a - b);
      prompt = {
        id: "naive-moves",
        question: `${first.value} has left index 0. How many values move to close the gap?`,
        choices: vals.map((v) => ({ id: `n${v}`, label: String(v) })),
        answerId: `n${rest}`,
        explain: `Every value still in the list moves one slot left: ${rest} moves. A queue of n values pays n - 1 moves per dequeue this way.`,
      };
    }
    removed = null;
    gap = false;
    moves += rest;
    completed++;
    const roles: Record<ElementId, Role> = {};
    for (const it of items) roles[it.id] = "changed";
    push({
      roles,
      line: "naive.dequeue.shift",
      phase: "Shift everything left",
      narration:
        rest === 0
          ? `The list is now empty: 0 moves this time. Dequeue returned ${first.value}.`
          : `Shift the ${plural(rest, "remaining value")} one slot left: ${plural(rest, "move")}. Dequeue returned ${first.value}.`,
      ...(prompt ? { prompt } : {}),
      ...(prompt ? takeKey() : {}),
    });
  }

  removed = null;
  gap = false;
  op = null;
  push({
    roles: {},
    line: null,
    phase: "Done",
    narration: `Done. ${items.length ? `Front to back: ${items.map((it) => it.value).join(", ")}.` : "The queue is empty."} Dequeues moved values ${moves} times in all.`,
    key: true,
  });
  return { vizId: "queue.naive", frames, result: { values: items.map((it) => it.value), outputs } };
}
