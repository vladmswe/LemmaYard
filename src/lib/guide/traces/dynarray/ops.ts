// Generator of "dynarray.ops": append / pop on a dynamic array that grows when
// full and shrinks when it gets sparse. A resize allocates a second buffer,
// copies the elements one by one, then switches to it.
import type { Counters, ElementId, Frame, PredictPrompt, Role, Trace } from "../../contracts";

import {
  grownCapacity,
  shrunkCapacity,
  type DynBuffer,
  type DynCell,
  type DynInput,
  type DynState,
} from "./types";

const ONE_BY_ONE = 8; // resizes of up to this many elements copy one frame per element
const SHOWN = 3; // larger resizes show this many copies, then the rest in one frame

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function copiesText(n: number): string {
  return n === 1 ? "1 copy" : `${n} copies`;
}

/** Average with one decimal, e.g. 2.8 (trailing ".0" dropped). */
export function formatAverage(costs: readonly number[]): string {
  if (costs.length === 0) return "0";
  const avg = costs.reduce((s, c) => s + c, 0) / costs.length;
  return String(Math.round(avg * 10) / 10);
}

export interface DynResult {
  readonly values: number[]; // elements after the last op
  readonly capacity: number;
  readonly popped: (number | null)[]; // value of each pop; null = pop on empty (error)
}

export function generateDyn(input: DynInput): Trace<DynState, DynResult> {
  const minCapacity = input.initialCapacity;
  const { growth, shrink } = input;
  let bufNo = 0;
  const newBuffer = (capacity: number): { id: ElementId; capacity: number; slots: (DynCell | null)[] } => ({
    id: `b${bufNo++}`,
    capacity,
    slots: Array.from({ length: capacity }, () => null),
  });
  let buffer = newBuffer(minCapacity);
  let next: ReturnType<typeof newBuffer> | null = null;
  let size = 0;
  let writes = 0;
  let copies = 0;
  let resizes = 0;
  let completed = 0;
  let opLabel: string | null = null;
  let keyLeft = 4;
  let askedGrow = false;
  let askedShrink = false;
  const costs: number[] = [];
  const popped: (number | null)[] = [];
  const frames: Frame<DynState>[] = [];

  const copyBuf = (b: { id: ElementId; capacity: number; slots: (DynCell | null)[] }): DynBuffer => ({
    id: b.id,
    capacity: b.capacity,
    slots: b.slots.slice(),
  });
  const snap = (): DynState => ({
    buffer: copyBuf(buffer),
    next: next ? copyBuf(next) : null,
    size,
    minCapacity,
    growth,
    shrink,
    costs: costs.slice(),
    op: opLabel,
    completed,
  });
  const counters = (): Counters => ({ writes, copies, resizes });
  const push = (f: Omit<Frame<DynState>, "state" | "counters">) =>
    frames.push({ ...f, state: snap(), counters: counters() });
  const takeKey = (): { key?: true } => {
    if (keyLeft > 0) {
      keyLeft--;
      return { key: true };
    }
    return {};
  };

  push({
    roles: {},
    line: null,
    phase: "Start",
    narration: `We start with an empty dynamic array of capacity ${minCapacity}. It grows ${growth === 2 ? "x2" : "x1.5"} when full and shrinks to half when only ${shrink === "quarter" ? "a quarter" : "half"} of it is in use.`,
    key: true,
  });

  /** Resize to `cap`: allocate, copy element by element, switch buffers. Returns the copies made. */
  const resize = (cap: number): number => {
    const target = newBuffer(cap);
    next = target;
    resizes++;
    push({
      roles: { [target.id]: "new" },
      line: "dynarray.resize.alloc",
      phase: "Allocate a new buffer",
      narration:
        size === 0
          ? `Allocate a new buffer with ${plural(cap, "slot")}. The array is empty, so there is nothing to copy.`
          : `Allocate a new buffer with ${plural(cap, "slot")}. The old buffer stays until ${
              size === 1 ? "its 1 element is" : `all ${size} elements are`
            } copied over.`,
    });
    const n = size;
    let k = 0;
    while (k < n) {
      if (n > ONE_BY_ONE && k === SHOWN) {
        for (let t = k; t < n; t++) {
          const src = buffer.slots[t] as DynCell;
          target.slots[t] = { id: `${target.id}s${t}`, value: src.value };
        }
        copies += n - k;
        const roles: Record<ElementId, Role> = {};
        for (let t = k; t < n; t++) roles[`${target.id}s${t}`] = "new";
        push({
          roles,
          line: "dynarray.resize.copy",
          phase: "Copy the elements",
          narration: `Copy the remaining ${plural(n - k, "element")} the same way, one write each. This resize copies ${plural(n, "element")} in total.`,
        });
        k = n;
        break;
      }
      const src = buffer.slots[k] as DynCell;
      const cell: DynCell = { id: `${target.id}s${k}`, value: src.value };
      target.slots[k] = cell;
      copies++;
      push({
        roles: { [src.id]: "compared", [cell.id]: "new" },
        line: "dynarray.resize.copy",
        phase: "Copy the elements",
        narration: `Copy ${src.value} from slot ${k} into the new buffer (copy ${k + 1} of ${n}).`,
      });
      k++;
    }
    const oldCap = buffer.capacity;
    buffer = target;
    next = null;
    push({
      roles: { [buffer.id]: "changed" },
      line: "dynarray.resize.swap",
      phase: "Switch buffers",
      narration: `Switch to the new buffer and free the old one: capacity ${oldCap} becomes ${cap}. This resize cost ${copiesText(n)}.`,
      ...takeKey(),
    });
    return n;
  };

  for (const op of input.ops) {
    if (op.kind === "append") {
      opLabel = `append ${op.value}`;
      let opCopies = 0;
      if (size === buffer.capacity) {
        const cap = grownCapacity(buffer.capacity, growth);
        let prompt: PredictPrompt | undefined;
        if (!askedGrow && size >= 3) {
          askedGrow = true;
          const vals = [...new Set([0, 1, size, cap])].sort((x, y) => x - y);
          prompt = {
            id: "dyn-grow-copies",
            question: `Capacity ${buffer.capacity}, size ${size}: how many copies will appending ${op.value} cause?`,
            choices: vals.map((v) => ({ id: `n${v}`, label: String(v) })),
            answerId: `n${size}`,
            explain: `The array is full, so it moves to a buffer of ${cap} slots and copies all ${size} elements first. Only then is ${op.value} written.`,
          };
        }
        push({
          roles: { [buffer.id]: "current" },
          line: "dynarray.append.grow",
          phase: "Full: grow",
          narration: `Append ${op.value}: size ${size} equals capacity ${buffer.capacity}, so there is no free slot. Grow to capacity ${cap} and copy the ${plural(size, "element")} first.`,
          ...(prompt ? { prompt } : {}),
        });
        opCopies = resize(cap);
      }
      const cell: DynCell = { id: `${buffer.id}s${size}`, value: op.value };
      buffer.slots[size] = cell;
      size++;
      writes++;
      completed++;
      costs.push(1 + opCopies);
      push({
        roles: { [cell.id]: "new" },
        line: "dynarray.append.write",
        phase: "Write at the end",
        narration: `Write ${op.value} into slot ${size - 1}; size ${size}, capacity ${buffer.capacity}. Cost of this append: ${
          opCopies === 0 ? "1 write" : `1 write + ${copiesText(opCopies)}`
        }. Average so far: ${formatAverage(costs)} per op.`,
      });
      continue;
    }

    // pop
    opLabel = "pop";
    if (size === 0) {
      completed++;
      popped.push(null);
      push({
        roles: { [buffer.id]: "error" },
        line: "dynarray.pop.empty",
        phase: "Pop on empty",
        narration: `Pop fails: the array is empty, so there is no value to return. Our code raises an error instead of returning garbage.`,
      });
      continue;
    }
    size--;
    const cell = buffer.slots[size] as DynCell;
    popped.push(cell.value);
    writes++; // clearing the slot
    const cap = shrunkCapacity(size, buffer.capacity, minCapacity, shrink);
    if (cap === null) {
      completed++;
      costs.push(1);
    }
    push({
      roles: { [cell.id]: "removed" },
      line: "dynarray.pop.read",
      phase: "Pop the last",
      narration: `Pop returns ${cell.value} from slot ${size} and clears it; size is now ${size} of ${buffer.capacity}.${
        cap === null ? ` Cost: 1 write. Average so far: ${formatAverage(costs)} per op.` : ""
      }`,
    });
    buffer.slots[size] = null;
    if (cap !== null) {
      let prompt: PredictPrompt | undefined;
      if (!askedShrink) {
        askedShrink = true;
        const vals = [...new Set([buffer.capacity, cap, Math.max(1, size)])].sort((x, y) => x - y);
        prompt = {
          id: "dyn-shrink-capacity",
          question: `Size is now ${size} of capacity ${buffer.capacity}. What will the capacity be once this pop finishes?`,
          choices: vals.map((v) => ({ id: `n${v}`, label: String(v) })),
          answerId: `n${cap}`,
          explain:
            shrink === "quarter"
              ? `${size} is at most a quarter of ${buffer.capacity}, so the array shrinks to half: ${cap}. Half the slots stay free for later appends.`
              : `${size} is at most half of ${buffer.capacity}, so this policy shrinks to ${cap}, leaving no free slot at all.`,
        };
      }
      push({
        roles: { [buffer.id]: "current" },
        line: "dynarray.pop.shrink",
        phase: "Sparse: shrink",
        narration:
          shrink === "quarter"
            ? `Size ${size} is at most a quarter of capacity ${buffer.capacity}, so shrink to ${cap}. Waiting for a quarter leaves room to append before the next grow.`
            : `Size ${size} is at most half of capacity ${buffer.capacity}, so this policy shrinks to ${cap}. The new buffer is full: one append will grow it again.`,
        ...(prompt ? { prompt } : {}),
      });
      const opCopies = resize(cap);
      completed++;
      costs.push(1 + opCopies);
      // The swap frame closes the op: its state includes the op's cost.
      const last = frames[frames.length - 1] as Frame<DynState>;
      frames[frames.length - 1] = { ...last, state: snap() };
    }
  }

  opLabel = null;
  const total = costs.reduce((s, c) => s + c, 0);
  push({
    roles: {},
    line: null,
    phase: "Done",
    narration: `Done: ${plural(costs.length, "op")} cost ${total} in all (${plural(writes, "write")}, ${copies} copies), ${plural(resizes, "resize")}. Average ${formatAverage(costs)} per op; capacity ${buffer.capacity}.`,
    key: true,
  });
  const values = buffer.slots.slice(0, size).map((c) => (c as DynCell).value);
  return { vizId: "dynarray.ops", frames, result: { values, capacity: buffer.capacity, popped } };
}
