// Generator of "stack.monotonic": next greater element with a stack of
// indices whose values never increase from bottom to top. Each new value pops
// every smaller value on top (they have found their answer), then is pushed.
import type { Counters, ElementId, Frame, PredictChoice, PredictPrompt, Role, Trace } from "../../contracts";

import { monoAnswerId, monoEntryId, monoItemId, type MonoInput, type MonoItem, type MonoState } from "./types";

function list(xs: readonly (number | string)[]): string {
  if (xs.length <= 1) return xs.join("");
  return `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
}

function indicesLabel(xs: readonly number[]): string {
  return xs.length === 1 ? `Only index ${xs[0]}` : `Indices ${list(xs)}`;
}

export function generateMonotonic(input: MonoInput): Trace<MonoState, number[]> {
  const a = input.values;
  const n = a.length;
  const items: MonoItem[] = a.map((value, i) => ({ id: monoItemId(i), value }));
  const answers: (number | null)[] = a.map(() => null);
  const stack: number[] = [];
  let popped: number[] = [];
  let cur: number | null = null;
  let pushes = 0;
  let pops = 0;
  let comparisons = 0;
  let asked = false;
  const frames: Frame<MonoState>[] = [];

  const snap = (): MonoState => ({
    items,
    answers: answers.slice(),
    stack: stack.slice(),
    popped: popped.slice(),
    i: cur,
    pushes,
    pops,
  });
  const counters = (): Counters => ({ comparisons });
  const push = (f: Omit<Frame<MonoState>, "state" | "counters">) => frames.push({ ...f, state: snap(), counters: counters() });
  const stackValues = () => stack.map((j) => a[j] as number);

  push({
    roles: {},
    line: null,
    phase: "Start",
    narration: `For each of these ${n} values we look for the next greater value to its right. A stack keeps the indices still waiting for an answer.`,
    key: true,
  });

  for (let i = 0; i < n; i++) {
    const x = a[i] as number;
    cur = i;
    popped = [];
    const resolved: number[] = [];
    while (stack.length > 0) {
      comparisons++;
      const top = stack.at(-1) as number;
      if ((a[top] as number) >= x) break;
      stack.pop();
      answers[top] = x;
      resolved.push(top);
      pops++;
    }
    if (resolved.length > 0) {
      popped = resolved.slice();
      let prompt: PredictPrompt | undefined;
      const before = [...stack, ...resolved.slice().reverse()]; // the stack when x arrived, bottom to top
      if (!asked && resolved.length >= 2 && frames.length > 1) {
        asked = true;
        const right = resolved.slice().sort((p, r) => p - r);
        const options: number[][] = [right, [resolved[0] as number]];
        if (before.length > right.length) options.push(before.slice().sort((p, r) => p - r));
        const choices: PredictChoice[] = options.map((o, k) => ({ id: ["popped", "top-only", "whole-stack"][k] as string, label: indicesLabel(o) }));
        prompt = {
          id: "mono-resolved",
          question: `Which indices get their answer when ${x} arrives?`,
          choices,
          answerId: "popped",
          explain: `${x} pops every smaller value from the top: ${list(right.map((j) => a[j] as number))} at ${indicesLabel(right).toLowerCase()}. ${
            stack.length ? `It stops at ${a[stack.at(-1) as number]}, which is not smaller.` : "Then the stack is empty."
          }`,
        };
      }
      const roles: Record<ElementId, Role> = { [monoItemId(i)]: "current" };
      for (const j of resolved) {
        roles[monoAnswerId(j)] = "done";
        roles[monoEntryId(j)] = "removed";
      }
      push({
        roles,
        line: "monotonic.pop",
        phase: "Pop the smaller ones",
        narration: `${x} arrives at index ${i}. It is greater than ${list(resolved.map((j) => a[j] as number))} on top, so pop ${
          resolved.length === 1 ? `index ${resolved[0]}: its` : `indices ${list(resolved.slice().sort((p, r) => p - r))}: their`
        } next greater value is ${x}.`,
        ...(prompt ? { prompt } : {}),
        ...(prompt ? { key: true } : {}),
      });
    }
    popped = [];
    const topBefore = stack.at(-1);
    stack.push(i);
    pushes++;
    // The frame before the prompt must not list the stack indices (they are the choices).
    const vals = stackValues();
    push({
      roles: { [monoItemId(i)]: "current", [monoEntryId(i)]: "new" },
      line: "monotonic.push",
      phase: "Push the index",
      narration:
        resolved.length > 0
          ? `Push index ${i}. Values on the stack now read ${vals.join(", ")} from bottom to top: they never increase.`
          : topBefore === undefined
            ? `${x} arrives at index ${i}. The stack is empty, so push index ${i}: it waits for something greater.`
            : `${x} arrives at index ${i}. It is not greater than ${a[topBefore]} on top, so nothing pops. Push it: the values ${vals.join(", ")} never increase.`,
    });
  }

  cur = null;
  popped = [];
  const left = stack.slice();
  const roles: Record<ElementId, Role> = {};
  for (const j of left) {
    answers[j] = -1;
    roles[monoAnswerId(j)] = "done";
  }
  for (let j = 0; j < n; j++) if (answers[j] === null) answers[j] = -1;
  push({
    roles,
    line: null,
    phase: "Done",
    narration:
      left.length > 0
        ? `Done. ${left.length === 1 ? "Index" : "Indices"} ${list(left)} never met a greater value, so ${left.length === 1 ? "its" : "their"} answer is -1. ${pushes} pushes and ${pops} pops in all.`
        : `Done. Every index found a greater value. ${pushes} pushes and ${pops} pops in all.`,
    key: true,
  });
  return { vizId: "stack.monotonic", frames, result: answers as number[] };
}
