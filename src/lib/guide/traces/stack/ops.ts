// Generator of "stack.ops": push / pop / peek on a stack backed by an array
// that starts with 4 slots and doubles when full. `top` is always size - 1.
import type { Counters, Frame, PredictChoice, PredictPrompt, Trace } from "../../contracts";

import {
  STACK_START_CAPACITY,
  stackOpLabel,
  type StackInput,
  type StackItem,
  type StackOp,
  type StackState,
} from "./types";

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export interface StackResult {
  readonly values: number[]; // bottom to top, after the last op
  readonly capacity: number;
  /** One entry per pop or peek: the value returned, or null when it failed on an empty stack. */
  readonly outputs: (number | null)[];
}

interface PlannedPrompt {
  readonly op: number; // index of the op whose first frame asks
  readonly prompt: PredictPrompt;
}

const numberChoices = (values: readonly number[]): PredictChoice[] =>
  [...new Set(values)].map((v) => ({ id: `v${v < 0 ? `m${-v}` : v}`, label: String(v) }));

/**
 * The predict prompt, chosen by a dry run: the first push that comes right
 * after a successful pop, onto a non-empty stack, without a grow ("push x runs
 * next. What will be on top?"). It is asked while the pop's frame is on
 * screen, so the answer is not in the figure yet. Only with distinct choices.
 */
function planPrompts(ops: readonly StackOp[]): PlannedPrompt[] {
  const sim: number[] = [];
  let cap = STACK_START_CAPACITY;
  let lastPopped: number | null = null;
  let prevWasPop = false;
  for (const [k, op] of ops.entries()) {
    if (op.kind === "push") {
      const top = sim.at(-1);
      if (prevWasPop && top !== undefined && lastPopped !== null && sim.length < cap) {
        const vals = [top, lastPopped, op.value];
        if (new Set(vals).size === vals.length) {
          const choices = numberChoices([...vals].sort((a, b) => a - b));
          return [
            {
              op: k,
              prompt: {
                id: "stack-push-top",
                question: `${stackOpLabel(op)} runs next. What will be on top?`,
                choices,
                answerId: choices.find((c) => c.label === String(op.value))!.id,
                explain: `A push always lands on top. pop already took ${lastPopped} away, so ${op.value} goes on top of ${top}; peek would read it next.`,
              },
            },
          ];
        }
      }
      if (sim.length === cap) cap *= 2;
      sim.push(op.value);
      prevWasPop = false;
      continue;
    }
    prevWasPop = op.kind === "pop" && sim.length > 0;
    if (prevWasPop) lastPopped = sim.pop() as number;
  }
  return [];
}

export function generateStackOps(input: StackInput): Trace<StackState, StackResult> {
  const planned = planPrompts(input.ops);
  const promptAt = new Map(planned.map((p) => [p.op, p.prompt]));
  let bufNo = 0;
  let bufferId = `b${bufNo}`;
  let capacity = STACK_START_CAPACITY;
  let slots: (StackItem | null)[] = Array.from({ length: capacity }, () => null);
  let size = 0;
  let popped: StackItem | null = null;
  let op: string | null = null;
  let out: number | "error" | null = null;
  let completed = 0;
  let writes = 0;
  let reads = 0;
  let copies = 0;
  let keyLeft = 3;
  const outputs: (number | null)[] = [];
  const frames: Frame<StackState>[] = [];

  const snap = (): StackState => ({
    bufferId,
    capacity,
    slots: slots.slice(),
    size,
    top: size - 1,
    popped,
    op,
    out,
    completed,
  });
  const counters = (): Counters => ({ writes, reads, copies });
  /** Narration without numbers, used instead when it would name the next frame's prompt answer. */
  const quietText: (string | undefined)[] = [];
  const push = (f: Omit<Frame<StackState>, "state" | "counters"> & { quiet?: string }) => {
    const { quiet, ...rest } = f;
    quietText[frames.length] = quiet;
    frames.push({ ...rest, state: snap(), counters: counters() });
  };
  const takeKey = (): { key?: true } => (keyLeft-- > 0 ? { key: true } : {});
  const topPointer = () => ({ top: size > 0 ? (slots[size - 1] as StackItem).id : null });

  push({
    roles: {},
    pointers: topPointer(),
    line: null,
    phase: "Start",
    narration: `We run ${plural(input.ops.length, "op")} on an empty stack kept in an array of ${capacity} slots. top = -1 means the stack is empty.`,
    key: true,
  });

  input.ops.forEach((o, k) => {
    popped = null;
    op = stackOpLabel(o);
    const prompt = promptAt.get(k);
    const ask = prompt ? { prompt } : {};

    if (o.kind === "push") {
      let asked = false;
      if (size === capacity) {
        const oldCap = capacity;
        bufNo++;
        bufferId = `b${bufNo}`;
        capacity *= 2;
        slots = Array.from({ length: capacity }, (_, s) =>
          s < size ? { id: `${bufferId}s${s}`, value: (slots[s] as StackItem).value } : null,
        );
        copies += size;
        push({
          roles: { [bufferId]: "changed" },
          pointers: topPointer(),
          line: "stack.push.grow",
          phase: "Full: grow",
          narration: `Push ${o.value}: all ${oldCap} slots are in use, so copy the ${plural(size, "value")} into a new array of ${capacity} slots first.`,
          ...ask,
          ...takeKey(),
        });
        asked = true;
      }
      const item: StackItem = { id: `${bufferId}s${size}`, value: o.value };
      slots[size] = item;
      size++;
      writes++;
      completed++;
      push({
        roles: { [item.id]: "new" },
        pointers: topPointer(),
        line: "stack.push.write",
        phase: "Push",
        narration: `Push ${o.value}: write it at index ${size - 1} and move top up to ${size - 1}. Size ${size} of ${capacity}.`,
        quiet: "Write the new value in the first free slot, just above the old top, and move top up by one.",
        ...(asked ? {} : ask),
      });
      return;
    }

    const failLine = o.kind === "pop" ? "stack.pop.empty" : "stack.peek.empty";
    if (size === 0) {
      completed++;
      out = "error";
      outputs.push(null);
      push({
        roles: { [bufferId]: "error" },
        pointers: topPointer(),
        line: failLine,
        phase: o.kind === "pop" ? "Pop on empty" : "Peek on empty",
        narration: `${o.kind === "pop" ? "Pop" : "Peek"} fails: top = -1, so the stack is empty. Our code raises an error instead of returning a stale value.`,
        ...ask,
        ...takeKey(),
      });
      return;
    }

    const item = slots[size - 1] as StackItem;
    reads++;
    completed++;
    out = item.value;
    outputs.push(item.value);
    if (o.kind === "peek") {
      push({
        roles: { [item.id]: "current" },
        pointers: topPointer(),
        line: "stack.peek.read",
        phase: "Peek",
        narration: `Peek reads ${item.value} at index ${size - 1}, the top, and leaves it there.`,
        quiet: "Peek reads the value at index top and leaves the stack as it is.",
        ...ask,
      });
      return;
    }
    slots[size - 1] = null;
    size--;
    popped = item;
    push({
      roles: { [item.id]: "removed" },
      pointers: topPointer(),
      line: "stack.pop.read",
      phase: "Pop",
      narration: `Pop returns ${item.value} from index ${size}, the top. top moves down to ${size - 1}.`,
      quiet: "Pop removes the value at index top and returns it; top moves down by one.",
      ...ask,
    });
  });

  frames.forEach((f, i) => {
    const p = f.prompt;
    const prev = frames[i - 1];
    const quiet = quietText[i - 1];
    if (!p || !prev || quiet === undefined) return;
    const answer = p.choices.find((c) => c.id === p.answerId)?.label ?? "";
    if (new RegExp(`(?<![\\d.])${answer}(?![\\d.])`).test(prev.narration)) frames[i - 1] = { ...prev, narration: quiet };
  });
  popped = null;
  op = null;
  const values = slots.slice(0, size).map((s) => (s as StackItem).value);
  const fails = outputs.filter((x) => x === null).length;
  push({
    roles: {},
    pointers: topPointer(),
    line: null,
    phase: "Done",
    narration: `Done after ${plural(input.ops.length, "op")}${fails ? ` (${fails} failed on an empty stack)` : ""}. ${
      size ? `Bottom to top the stack holds ${values.join(", ")}.` : "The stack is empty."
    }`,
    key: true,
  });
  return { vizId: "stack.ops", frames, result: { values, capacity, outputs } };
}
