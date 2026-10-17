// "search.binary": lower-bound binary search on the half-open range [lo, hi).
// Each round compares the middle cell with the target and halves the range;
// when the range is empty, lo is the first index whose value is >= target,
// and one last comparison tells whether that cell holds the target.
import type { ElementId, Frame, PredictPrompt, Role, Trace } from "../../contracts";

import { toItems } from "./items";
import type { SearchInput, SearchState } from "./model";

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function generateBinary(input: SearchInput): Trace<SearchState, number> {
  const items = toItems(input.values);
  const values = input.values;
  const n = items.length;
  const target = input.target;
  const base = { op: "binary" as const, items, target, scanned: 0 };
  const idOf = (k: number): ElementId => (items[k] as { id: ElementId }).id;
  const frames: Frame<SearchState>[] = [];

  /** Cells outside [lo, hi) are muted: the search has ruled them out. */
  const outside = (lo: number, hi: number): Record<ElementId, Role> => {
    const roles: Record<ElementId, Role> = {};
    for (let k = 0; k < n; k++) if (k < lo || k >= hi) roles[idOf(k)] = "muted";
    return roles;
  };
  const rangePointers = (lo: number, hi: number, at: number | null) => {
    const p: Record<string, ElementId | null> = {};
    p.lo = lo < n ? idOf(lo) : null;
    p.hi = hi < n ? idOf(hi) : null;
    if (at !== null) p.mid = idOf(at);
    return p;
  };

  frames.push({
    state: { ...base, lo: null, hi: null, at: null, result: null },
    roles: {},
    line: null,
    phase: "Start",
    narration:
      n === 0
        ? `We will look for ${target} with binary search, but the array is empty.`
        : `We will look for ${target} in this sorted array of ${n} numbers. Binary search halves the range it still has to check after every comparison.`,
    counters: { comparisons: 0 },
    key: true,
  });

  let lo = 0;
  let hi = n;
  let comparisons = 0;
  frames.push({
    state: { ...base, lo, hi, at: null, result: null },
    roles: {},
    pointers: rangePointers(lo, hi, null),
    line: "search.binary.init",
    phase: "Set the range",
    narration: `The range is [lo, hi) = [0, ${n}): lo is the first index that may hold the answer, hi is one past the last. It holds all ${n} cells.`,
    counters: { comparisons },
  });

  let round = 0;
  let prevMid: number | null = null;
  while (lo < hi) {
    round++;
    const mid = Math.floor((lo + hi) / 2);
    const v = values[mid] as number;
    const less = v < target;
    comparisons++;
    let prompt: PredictPrompt | undefined;
    if (round === 2) {
      const others = [lo, hi - 1, prevMid, Math.floor((lo + hi + 1) / 2)].filter(
        (k): k is number => k !== null && k >= 0 && k < n && k !== mid,
      );
      const picks = [...new Set(others)].slice(0, 3);
      const choices = [mid, ...picks]
        .sort((a, b) => a - b)
        .map((k) => ({ id: `i${k}`, label: `Index ${k} (value ${values[k]})` }));
      prompt = {
        id: "binary-next-index",
        question: `The range is now [${lo}, ${hi}). Which index does binary search check next?`,
        choices,
        answerId: `i${mid}`,
        explain: `The middle of [${lo}, ${hi}) is (${lo} + ${hi}) // 2 = ${mid}, so the next comparison reads a[${mid}] = ${v}.`,
      };
    }
    frames.push({
      state: { ...base, lo, hi, at: mid, result: null },
      roles: { ...outside(lo, hi), [idOf(mid)]: "compared" },
      pointers: rangePointers(lo, hi, mid),
      line: "search.binary.compare",
      phase: "Check the middle",
      // Round 1 leaves the comparison open: the next frame's prompt asks which half the search keeps.
      narration:
        round === 1
          ? `The middle of [${lo}, ${hi}) is index ${mid}, holding ${v}. Compare it with the target ${target}.`
          : `The middle of [${lo}, ${hi}) is index ${mid}, holding ${v}. Is ${v} smaller than ${target}? ${less ? "Yes" : "No"}.`,
      counters: { comparisons },
      ...(prompt ? { prompt } : {}),
      ...(round === 1 ? { key: true } : {}),
    });

    prevMid = mid;
    const oldLo = lo;
    const oldHi = hi;
    if (less) lo = mid + 1;
    else hi = mid;
    const half: PredictPrompt | undefined =
      round === 1
        ? {
            id: "binary-half",
            question: `a[${mid}] = ${v} and the target is ${target}. Which part of the range does the search keep?`,
            choices: [
              { id: "left", label: `hi = ${mid}, keeping [${oldLo}, ${mid})` },
              { id: "right", label: `lo = ${mid + 1}, keeping [${mid + 1}, ${oldHi})` },
            ],
            answerId: less ? "right" : "left",
            explain: less
              ? `${v} is smaller than ${target}, and so is every cell to its left, so the answer lies after index ${mid}.`
              : `${v} is not smaller than ${target}, so the first cell >= ${target} is index ${mid} or one to its left: hi moves to ${mid}.`,
          }
        : undefined;
    frames.push({
      state: { ...base, lo, hi, at: null, result: null },
      roles: outside(lo, hi),
      pointers: rangePointers(lo, hi, null),
      line: less ? "search.binary.right" : "search.binary.left",
      phase: less ? "Keep the right part" : "Keep the left part",
      narration: less
        ? `${v} < ${target}, so the answer is right of index ${mid}: lo = ${lo}. The range [${lo}, ${hi}) has ${plural(hi - lo, "cell")} left.`
        : `${v} >= ${target}, so the answer is index ${mid} or left of it: hi = ${hi}. The range [${lo}, ${hi}) has ${plural(hi - lo, "cell")} left.`,
      counters: { comparisons },
      ...(half ? { prompt: half } : {}),
    });
  }

  // lo == hi: lo is the first index with a[lo] >= target (or n).
  if (lo < n) {
    const v = values[lo] as number;
    const equal = v === target;
    comparisons++;
    frames.push({
      state: { ...base, lo, hi, at: lo, result: null },
      roles: { ...outside(lo, lo + 1), [idOf(lo)]: "compared" },
      pointers: rangePointers(lo, hi, lo),
      line: "search.binary.check",
      phase: "Check the last candidate",
      narration: `The range is empty (lo = hi = ${lo}), so a[${lo}] = ${v} is the first value >= ${target}. Is it equal to ${target}? ${equal ? "Yes" : "No"}.`,
      counters: { comparisons },
    });
    if (equal) {
      frames.push({
        state: { ...base, lo, hi, at: lo, result: lo },
        roles: { ...outside(lo, lo + 1), [idOf(lo)]: "done" },
        pointers: rangePointers(lo, hi, null),
        line: "search.binary.found",
        phase: "Found",
        narration: `Return index ${lo}, where ${target} is stored. Binary search needed ${plural(comparisons, "comparison")} for ${plural(n, "cell")}.`,
        counters: { comparisons },
        key: true,
      });
      return { vizId: "search.binary", frames, result: lo };
    }
  }
  const allMuted: Record<ElementId, Role> = {};
  for (let k = 0; k < n; k++) allMuted[idOf(k)] = "muted";
  frames.push({
    state: { ...base, lo, hi, at: null, result: -1 },
    roles: allMuted,
    pointers: rangePointers(lo, hi, null),
    line: "search.binary.notFound",
    phase: "Not found",
    narration:
      lo >= n
        ? `Return -1: lo = ${n} is past the end, so every value is smaller than ${target}. That took ${plural(comparisons, "comparison")}.`
        : `Return -1: ${target} would belong at index ${lo}, but that cell holds ${values[lo]}. That took ${plural(comparisons, "comparison")}.`,
    counters: { comparisons },
    key: true,
  });
  return { vizId: "search.binary", frames, result: -1 };
}
