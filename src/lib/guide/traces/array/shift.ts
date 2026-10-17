// Generator of "array.shift": runs the ops one after another on a fixed array.
import type { Counters, ElementId, Frame, PredictPrompt, Role, Trace } from "../../contracts";

import { ARRAY_CAPACITY, ARRAY_ID, opLabel, type ArrayInput, type ArrayItem, type ArrayState } from "./types";

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Distinct non-negative number choices (ids "n<value>"), ascending; the correct one is kept. */
function numberChoices(correct: number, others: readonly number[]) {
  const vals = [...new Set([correct, ...others.filter((v) => v >= 0)])].slice(0, 4);
  return vals.sort((a, b) => a - b).map((v) => ({ id: `n${v}`, label: String(v) }));
}

export interface ArrayOpOutcome {
  readonly ok: boolean;
  readonly moves: number;
}

export function generateShift(input: ArrayInput): Trace<ArrayState, ArrayOpOutcome[]> {
  const capacity = ARRAY_CAPACITY;
  const slots: (ArrayItem | null)[] = Array.from({ length: capacity }, (_, k) =>
    k < input.values.length ? { id: `e${k}`, value: input.values[k] as number } : null,
  );
  let size = Math.min(input.values.length, capacity);
  let nextId = input.values.length;
  let moves = 0;
  let writes = 0;
  let completed = 0;
  let keyLeft = 4; // op-end frames flagged as key steps (plus start and summary)
  let askedInsert = false;
  let askedRemove = false;
  const outcomes: ArrayOpOutcome[] = [];
  const frames: Frame<ArrayState>[] = [];

  const snap = (op: string | null): ArrayState => ({ capacity, slots: slots.slice(), size, op, completed });
  const counters = (): Counters => ({ moves, writes });
  const push = (f: Omit<Frame<ArrayState>, "counters"> & { counters?: Counters }) =>
    frames.push({ ...f, counters: f.counters ?? counters() });
  const endKey = (): { key?: true } => {
    if (keyLeft > 0) {
      keyLeft--;
      return { key: true };
    }
    return {};
  };

  push({
    state: snap(null),
    roles: {},
    line: null,
    phase: "Start",
    narration: `We will run ${plural(input.ops.length, "op")} on this array of ${plural(size, "element")} and capacity ${capacity}, counting how many elements move.`,
    key: true,
  });

  input.ops.forEach((op, opIdx) => {
    const label = opLabel(op);
    const last = opIdx === input.ops.length - 1;
    if (op.kind === "insert") {
      const i = op.index;
      if (size === capacity) {
        completed++;
        outcomes.push({ ok: false, moves: 0 });
        push({
          state: snap(label),
          roles: { [ARRAY_ID]: "error" },
          line: "array.insert.full",
          phase: "Array is full",
          narration: `Insert ${op.value} at index ${i} fails: all ${capacity} slots are in use and a fixed array cannot grow. The code raises an error.`,
          ...(last ? {} : endKey()),
        });
        return;
      }
      if (i < 0 || i > size) {
        completed++;
        outcomes.push({ ok: false, moves: 0 });
        push({
          state: snap(label),
          roles: { [ARRAY_ID]: "error" },
          line: "array.insert.range",
          phase: "Index out of range",
          narration: `Insert at index ${i} fails: with size ${size} the valid positions are 0 to ${size}. The code raises an error.`,
          ...(last ? {} : endKey()),
        });
        return;
      }
      const need = size - i;
      push({
        state: snap(label),
        roles: {},
        line: "array.insert.range",
        phase: `Insert at ${i}`,
        // The move count is told on the first shift frame: a prompt may ask for it while this frame is on screen.
        narration:
          need === 0
            ? `Insert ${op.value} at index ${i}: that is the end of the array, so no element has to move.`
            : `Insert ${op.value} at index ${i}. First open a gap there, starting from the end.`,
      });
      let done = 0;
      for (let k = size - 1; k >= i; k--) {
        const item = slots[k] as ArrayItem;
        slots[k + 1] = item;
        slots[k] = null;
        moves++;
        done++;
        let prompt: PredictPrompt | undefined;
        if (!askedInsert && done === 1) {
          askedInsert = true;
          prompt = {
            id: "insert-moves",
            question: `How many elements move when you insert at index ${i} of this ${size}-element array?`,
            choices: numberChoices(need, [1, size, i, need - 1]),
            answerId: `n${need}`,
            explain: `Every element from index ${i} to ${size - 1} moves one slot right: ${size} - ${i} = ${need} moves.`,
          };
        }
        push({
          state: snap(label),
          roles: { [item.id]: "current" },
          line: "array.insert.shift",
          phase: "Shift right",
          narration:
            done === 1
              ? `The ${plural(need, "element")} at indices ${i} to ${size - 1} each move one slot right, from the end. Move ${item.value} from index ${k} to index ${k + 1} (move 1 of ${need}).`
              : `Move ${item.value} from index ${k} to index ${k + 1} (move ${done} of ${need}).`,
          ...(prompt ? { prompt } : {}),
        });
      }
      const item: ArrayItem = { id: `e${nextId++}`, value: op.value };
      slots[i] = item;
      size++;
      writes++;
      completed++;
      outcomes.push({ ok: true, moves: need });
      push({
        state: snap(label),
        roles: { [item.id]: "new" },
        line: "array.insert.write",
        phase: "Write the value",
        narration: `Write ${op.value} into index ${i}. Size is now ${size}; this insert moved ${plural(need, "element")}.`,
        ...(last ? {} : endKey()),
      });
      return;
    }

    // remove
    const i = op.index;
    if (i < 0 || i >= size) {
      completed++;
      outcomes.push({ ok: false, moves: 0 });
      push({
        state: snap(label),
        roles: { [ARRAY_ID]: "error" },
        line: "array.remove.range",
        phase: size === 0 ? "Array is empty" : "Index out of range",
        narration:
          size === 0
            ? `Remove at index ${i} fails: the array is empty. The code raises an error.`
            : `Remove at index ${i} fails: with size ${size} the valid indices are 0 to ${size - 1}. The code raises an error.`,
        ...(last ? {} : endKey()),
      });
      return;
    }
    const removed = slots[i] as ArrayItem;
    const need = size - 1 - i;
    push({
      state: snap(label),
      roles: { [removed.id]: "removed" },
      line: "array.remove.read",
      phase: `Remove at ${i}`,
      narration:
        need === 0
          ? `Remove index ${i}: read its value ${removed.value}. It is the last element, so nothing has to move.`
          : `Remove index ${i}: read its value ${removed.value}. Then close the gap it leaves.`,
    });
    let done = 0;
    for (let k = i; k < size - 1; k++) {
      const item = slots[k + 1] as ArrayItem;
      slots[k] = item;
      slots[k + 1] = null;
      moves++;
      done++;
      let prompt: PredictPrompt | undefined;
      if (!askedRemove && done === 1) {
        askedRemove = true;
        prompt = {
          id: "remove-moves",
          question: `How many elements move when you remove index ${i} of this ${size}-element array?`,
          choices: numberChoices(need, [1, size, i, need + 1]),
          answerId: `n${need}`,
          explain: `Every element after index ${i} moves one slot left: ${size} - 1 - ${i} = ${need} moves.`,
        };
      }
      push({
        state: snap(label),
        roles: { [item.id]: "current" },
        line: "array.remove.shift",
        phase: "Shift left",
        narration:
          done === 1
            ? `The ${plural(need, "element")} after index ${i} each move one slot left to close the gap. Move ${item.value} from index ${k + 1} to index ${k} (move 1 of ${need}).`
            : `Move ${item.value} from index ${k + 1} to index ${k} (move ${done} of ${need}).`,
        ...(prompt ? { prompt } : {}),
      });
    }
    size--;
    slots[size] = null;
    writes++;
    completed++;
    outcomes.push({ ok: true, moves: need });
    push({
      state: snap(label),
      roles: {},
      line: "array.remove.clear",
      phase: "Clear the last slot",
      narration: `Clear slot ${size} and return ${removed.value}. Size is now ${size}; this remove moved ${plural(need, "element")}.`,
      ...(last ? {} : endKey()),
    });
  });

  const roles: Record<ElementId, Role> = {};
  push({
    state: snap(null),
    roles,
    line: null,
    phase: "Done",
    narration: `All ops are done. Size ${size} of ${capacity}; ${plural(moves, "element move")} in total. Work near the front of an array costs the most.`,
    key: true,
  });
  return { vizId: "array.shift", frames, result: outcomes };
}
