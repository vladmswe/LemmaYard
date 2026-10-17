// Obviously-correct searches used only by tests.

/** Index of the first cell equal to target, and how many cells a left-to-right scan compares. */
export function linearSearchRef(a: readonly number[], target: number): { index: number; comparisons: number } {
  const index = a.indexOf(target);
  return { index, comparisons: index === -1 ? a.length : index + 1 };
}

/** bisect_left: the first index whose value is >= target (a.length if none). */
export function lowerBoundRef(a: readonly number[], target: number): number {
  const k = a.findIndex((v) => v >= target);
  return k === -1 ? a.length : k;
}

/** Binary search result on a sorted array: the lower bound if it holds target, else -1. */
export function binarySearchRef(a: readonly number[], target: number): number {
  const k = lowerBoundRef(a, target);
  return k < a.length && a[k] === target ? k : -1;
}
