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
 * Predict prompts, chosen by a dry run: the first pop with two or more values
 * on the stack ("which value comes out?") and the first peek after a pop
 * ("what is on top?"). Only when the choices are distinct numbers.
 */
function planPrompts(ops: readonly StackOp[]): PlannedPrompt[] {
  const sim: number[] = [];
  const out: PlannedPrompt[] = [];
  let askedPop = false;
  let askedPeek = false;
  let lastPopped: number | null = null;
  ops.forEach((op, k) => {
    if (op.kind === "push") {
      sim.push(op.value);
      return;
    }
    const top = sim.at(-1);
    if (op.kind === "pop") {
      if (!askedPop && sim.length >= 2 && k > 0) {
        const below = sim[sim.length - 2] as number;
        if (below !== top) {
          askedPop = true;
          const choices = numberChoices([sim[0] as number, below, top as number].sort((a, b) => a - b));
          out.push({
            op: k,
            prompt: {
              id: "stack-pop-which",
              question: "pop() runs now. Which value comes out?",
              choices,
              answerId: choices.find((c) => c.label === String(top))!.id,
              explain: `A stack returns the most recent push first. ${top} went in last, so it sits at the top and comes out now.`,
            },
          });
        }
      }
      if (sim.length > 0) lastPopped = sim.pop() as number;
      return;
    }
    // peek
    if (!askedPeek && lastPopped !== null && sim.length >= 2 && k > 0) {
      const others = [sim[0] as number, lastPopped].filter((v) => v !== top);
      if (others.length > 0 && !others.includes(top as number)) {
        askedPeek = true;
        const done = ops.slice(0, k).map(stackOpLabel);
        const question =
          done.length <= 6 ? `After ${done.join(", ")}, what is on top?` : "After these ops, what does peek() return?";
        const choices = numberChoices([...others, top as number].sort((a, b) => a - b));
        out.push({
          op: k,
          prompt: {
            id: "stack-peek-top",
            question,
            choices,
            answerId: choices.find((c) => c.label === String(top))!.id,
            explain: `pop took ${lastPopped} away, and every later push lands on top. The newest value still on the stack is ${top}; peek reads it without removing it.`,
          },
        });
      }
    }
  });
  return out;
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
  const push = (f: Omit<Frame<StackState>, "state" | "counters">) => frames.push({ ...f, state: snap(), counters: counters() });
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
    // The frame shown while the next op's prompt is open must not name values.
    const quiet = promptAt.has(k + 1);

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
        narration: quiet
          ? "Write the new value in the first free slot, just above the old top, and move top up by one."
          : `Push ${o.value}: write it at index ${size - 1} and move top up to ${size - 1}. Size ${size} of ${capacity}.`,
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
        narration: quiet
          ? "Peek reads the value at index top and leaves the stack as it is."
          : `Peek reads ${item.value} at index ${size - 1}, the top, and leaves it there.`,
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
      narration: quiet
        ? "Pop removes the value at index top and returns it; top moves down by one."
        : `Pop returns ${item.value} from index ${size}, the top. top moves down to ${size - 1}.`,
      ...ask,
    });
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
