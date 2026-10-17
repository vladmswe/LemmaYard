// Obviously-correct merge used only by tests: concatenate and sort.

export function mergeRef(a: readonly number[], b: readonly number[]): number[] {
  return [...a, ...b].sort((x, y) => x - y);
}

/** Multiset equality of two number lists. */
export function sameMultiset(x: readonly number[], y: readonly number[]): boolean {
  if (x.length !== y.length) return false;
  const sx = [...x].sort((p, q) => p - q);
  const sy = [...y].sort((p, q) => p - q);
  return sx.every((v, k) => v === sy[k]);
}
