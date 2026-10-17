// Obviously-correct range sums used only by tests.

/** Sum of a[l..r) by adding the cells one by one. */
export function rangeSumRef(a: readonly number[], l: number, r: number): number {
  let s = 0;
  for (let k = l; k < r; k++) s += a[k] as number;
  return s;
}

/** p[i] = sum of the first i numbers, for i = 0..n. */
export function prefixRef(a: readonly number[]): number[] {
  return Array.from({ length: a.length + 1 }, (_, i) => rangeSumRef(a, 0, i));
}
