// "search.linear": compare cells from index 0 until one equals the target.
// Arrays longer than 8 show the first three comparisons one by one and then
// fast-forward, so a 32-cell scan stays short to watch.
import type { ElementId, Frame, PredictPrompt, Role, Trace } from "../../contracts";

import { toItems } from "./items";
import type { SearchInput, SearchState } from "./model";

const EXPLICIT = 3; // comparisons shown one by one before fast-forwarding
const SHORT = 8; // arrays up to this length are never fast-forwarded

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Distinct number choices (ids "n<value>") in ascending order; the correct one is always kept. */
function numberChoices(correct: number, others: readonly number[]) {
  const vals = [...new Set([correct, ...others])].filter((v) => v >= 0).slice(0, 4);
  return vals.sort((a, b) => a - b).map((v) => ({ id: `n${v}`, label: String(v) }));
}

export function generateLinear(input: SearchInput): Trace<SearchState, number> {
  const items = toItems(input.values);
  const n = items.length;
  const target = input.target;
  const idx = input.values.indexOf(target);
  const base = { op: "linear" as const, items, target, lo: null, hi: null };
  const frames: Frame<SearchState>[] = [];

  frames.push({
    state: { ...base, at: null, scanned: 0, result: null },
    roles: {},
    line: null,
    phase: "Start",
    narration:
      n === 0
        ? `We will look for ${target}, but the array is empty.`
        : `We will look for ${target} by comparing the ${n} cells one by one, starting at index 0. Linear search does not use the sorted order.`,
    counters: { comparisons: 0 },
    key: true,
  });

  const visited = (upTo: number): Record<ElementId, Role> => {
    const roles: Record<ElementId, Role> = {};
    for (let k = 0; k < upTo; k++) roles[(items[k] as { id: ElementId }).id] = "visited";
    return roles;
  };

  const compareFrame = (i: number, prompt?: PredictPrompt): Frame<SearchState> => {
    const item = items[i] as { id: ElementId; value: number };
    const equal = item.value === target;
    return {
      state: { ...base, at: i, scanned: i + 1, result: null },
      roles: { ...visited(i), [item.id]: "compared" },
      pointers: { i: item.id },
      line: "search.linear.compare",
      phase: "Compare",
      narration: equal
        ? `Compare a[${i}] = ${item.value} with ${target}. They are equal, so the search can stop here.`
        : `Compare a[${i}] = ${item.value} with ${target}. They differ, so move on to index ${i + 1}.`,
      counters: { comparisons: i + 1 },
      ...(prompt ? { prompt } : {}),
      ...(i === 0 ? { key: true } : {}),
    };
  };

  const thirdPrompt = (): PredictPrompt => {
    const v = (items[2] as { value: number }).value;
    const equal = v === target;
    return {
      id: "linear-stop",
      question: `Next the search compares the cell at index 2 with ${target}. Will it stop there?`,
      choices: [
        { id: "yes", label: `Yes, ${v} is the target` },
        { id: "no", label: `No, ${v} is not ${target}` },
      ],
      answerId: equal ? "yes" : "no",
      explain: equal
        ? `${v} equals ${target}, so linear search returns index 2.`
        : `${v} is not ${target}, so the search moves on to index 3.`,
    };
  };

  const stop = idx === -1 ? n : idx + 1; // number of comparisons the search makes
  const fastForward = n > SHORT;
  let i = 0;
  while (i < stop) {
    if (fastForward && i === EXPLICIT && (idx === -1 || idx > EXPLICIT + 1)) {
      // One frame for the comparisons EXPLICIT .. last, where last is the cell before the match.
      const last = idx === -1 ? n - 1 : idx - 1;
      const count = last - EXPLICIT + 1;
      const roles = visited(last);
      roles[(items[last] as { id: ElementId }).id] = "compared";
      const prompt: PredictPrompt | undefined =
        idx === -1
          ? {
              id: "linear-total",
              question: `No match in the first ${EXPLICIT} cells. How many comparisons will linear search have made in total when it returns -1?`,
              choices: numberChoices(n, [Math.ceil(Math.log2(n + 1)), Math.floor(n / 2), n - EXPLICIT]),
              answerId: `n${n}`,
              explain: `A missing target is the worst case: linear search compares every one of the ${n} cells, so it makes ${n} comparisons.`,
            }
          : undefined;
      frames.push({
        state: { ...base, at: last, scanned: last + 1, result: null },
        roles,
        pointers: { i: (items[last] as { id: ElementId }).id },
        line: "search.linear.compare",
        phase: "Keep comparing",
        narration: `Compare indices ${EXPLICIT} to ${last} the same way: ${plural(count, "more comparison")}, and none of these cells holds ${target}.`,
        counters: { comparisons: last + 1 },
        ...(prompt ? { prompt } : {}),
      });
      i = last + 1;
      continue;
    }
    frames.push(compareFrame(i, i === 2 ? thirdPrompt() : undefined));
    i++;
  }

  if (idx !== -1) {
    frames.push({
      state: { ...base, at: idx, scanned: idx + 1, result: idx },
      roles: { ...visited(idx), [(items[idx] as { id: ElementId }).id]: "done" },
      pointers: { i: (items[idx] as { id: ElementId }).id },
      line: "search.linear.found",
      phase: "Found",
      narration: `Return index ${idx}: a[${idx}] equals ${target}. Linear search needed ${plural(idx + 1, "comparison")}.`,
      counters: { comparisons: idx + 1 },
      key: true,
    });
    return { vizId: "search.linear", frames, result: idx };
  }
  frames.push({
    state: { ...base, at: null, scanned: n, result: -1 },
    roles: visited(n),
    line: "search.linear.notFound",
    phase: "Not found",
    narration:
      n === 0
        ? `Return -1: there is nothing to compare.`
        : `Return -1: all ${n} cells were compared and none equals ${target}. That is ${plural(n, "comparison")}, one per cell.`,
    counters: { comparisons: n },
    key: true,
  });
  return { vizId: "search.linear", frames, result: -1 };
}
