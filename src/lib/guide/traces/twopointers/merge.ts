// Generator of "twopointers.merge": merge two sorted lists with pointers i, j.
// Ties take from A first (stable). When one list runs out, the rest of the
// other is copied as it is.
import type { Counters, ElementId, Frame, PredictPrompt, Role, Trace } from "../../contracts";

import type { MergeCell, MergeInput, MergeState } from "./types";

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function generateMerge(input: MergeInput): Trace<MergeState, number[]> {
  const a: MergeCell[] = input.a.map((value, k) => ({ id: `a${k}`, value }));
  const b: MergeCell[] = input.b.map((value, k) => ({ id: `b${k}`, value }));
  const n = a.length;
  const m = b.length;
  const c: (MergeCell | null)[] = Array.from({ length: n + m }, () => null);
  let i = 0;
  let j = 0;
  let comparisons = 0;
  let writes = 0;
  let ranOut: "A" | "B" | null = null;
  const frames: Frame<MergeState>[] = [];
  const snap = (): MergeState => ({ a, b, c: c.slice(), i, j, ranOut });
  const counters = (): Counters => ({ comparisons, writes });
  const pointers = () => ({
    i: i < n ? (a[i] as MergeCell).id : null,
    j: j < m ? (b[j] as MergeCell).id : null,
  });
  /** Used cells of A and B are crossed out. */
  const used = (): Record<ElementId, Role> => {
    const roles: Record<ElementId, Role> = {};
    for (let k = 0; k < i; k++) roles[(a[k] as MergeCell).id] = "removed";
    for (let k = 0; k < j; k++) roles[(b[k] as MergeCell).id] = "removed";
    return roles;
  };

  frames.push({
    state: snap(),
    roles: {},
    pointers: pointers(),
    line: null,
    phase: "Start",
    narration: `We will merge sorted A (${plural(n, "number")}) and sorted B (${plural(m, "number")}) into C. Pointer i marks the first unused number of A, j the first of B.`,
    counters: counters(),
    key: true,
  });

  const take = (fromA: boolean, line: "merge.takeA" | "merge.takeB" | "merge.restA" | "merge.restB", key: boolean) => {
    const k = i + j;
    const src = fromA ? (a[i] as MergeCell) : (b[j] as MergeCell);
    const cell: MergeCell = { id: `c${k}`, value: src.value };
    c[k] = cell;
    writes++;
    if (fromA) i++;
    else j++;
    frames.push({
      state: snap(),
      roles: { ...used(), [cell.id]: "new" },
      pointers: pointers(),
      line,
      phase: line === "merge.restA" || line === "merge.restB" ? "Copy the rest" : fromA ? "Take from A" : "Take from B",
      narration: `Write ${src.value} into C[${k}] and move ${fromA ? `i to ${i}` : `j to ${j}`}.${
        fromA ? (i === n ? " A is now used up." : "") : j === m ? " B is now used up." : ""
      }`,
      counters: counters(),
      ...(key ? { key: true } : {}),
    });
  };

  while (i < n && j < m) {
    const x = (a[i] as MergeCell).value;
    const y = (b[j] as MergeCell).value;
    const fromA = x <= y;
    comparisons++;
    let prompt: PredictPrompt | undefined;
    if (comparisons === 2) {
      prompt = {
        id: "merge-next",
        question: `i points at ${x} in A and j at ${y} in B. Which value goes into C next?`,
        choices: [
          { id: "a", label: `${x} from A` },
          { id: "b", label: `${y} from B` },
        ],
        answerId: fromA ? "a" : "b",
        explain:
          x === y
            ? `They are equal; our merge takes from A first on a tie, so the order of equal values is kept.`
            : `Both lists are sorted, so the smaller of the two front numbers, ${Math.min(x, y)}, is the smallest number not yet in C.`,
      };
    }
    frames.push({
      state: snap(),
      roles: { ...used(), [(a[i] as MergeCell).id]: "compared", [(b[j] as MergeCell).id]: "compared" },
      pointers: pointers(),
      line: "merge.compare",
      phase: "Compare the fronts",
      narration:
        x === y
          ? `Compare A[${i}] = ${x} with B[${j}] = ${y}: equal, so take the one from A first.`
          : `Compare A[${i}] = ${x} with B[${j}] = ${y}: ${Math.min(x, y)} is smaller, so it goes next.`,
      counters: counters(),
      ...(prompt ? { prompt } : {}),
    });
    take(fromA, fromA ? "merge.takeA" : "merge.takeB", comparisons === 1);
  }

  if (n + m > 0) {
    ranOut = i === n ? "A" : "B";
    const restFromA = ranOut === "B";
    const left = restFromA ? n - i : m - j;
    frames.push({
      state: snap(),
      roles: used(),
      pointers: pointers(),
      line: restFromA ? "merge.restA" : "merge.restB",
      phase: ranOut === "A" ? "A ran out" : "B ran out",
      narration:
        ranOut === "A"
          ? `A is empty (i = ${i} = len(A)), so there is nothing to compare. Copy ${left === 1 ? "the 1 number left in B as it is" : `the ${left} numbers left in B as they are`}.`
          : `B is empty (j = ${j} = len(B)), so there is nothing to compare. Copy ${left === 1 ? "the 1 number left in A as it is" : `the ${left} numbers left in A as they are`}.`,
      counters: counters(),
      key: true,
    });
    while (i < n) take(true, "merge.restA", false);
    while (j < m) take(false, "merge.restB", false);
  }

  const result = c.map((cell) => (cell as MergeCell).value);
  frames.push({
    state: snap(),
    roles: { ...used(), ...Object.fromEntries(c.map((cell) => [(cell as MergeCell).id, "done" as Role])) },
    pointers: pointers(),
    line: null,
    phase: "Merged",
    narration: `C holds all ${plural(n + m, "number")} in sorted order: ${plural(writes, "write")} and ${plural(comparisons, "comparison")}, linear in len(A) + len(B).`,
    counters: counters(),
    key: true,
  });
  return { vizId: "twopointers.merge", frames, result };
}
