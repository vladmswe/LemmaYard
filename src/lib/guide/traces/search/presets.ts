// Inputs of the search player. Presets name their op: the op selector then
// switches between linear and binary search on the same array.
import type { InputPreset } from "../../contracts";
import { mulberry32, randomInt } from "../../random";

import type { SearchInput, SearchOp } from "./model";

export const ARRAY_8: readonly number[] = [3, 7, 12, 18, 25, 31, 40, 46];
export const ARRAY_16: readonly number[] = [2, 5, 9, 14, 17, 21, 26, 30, 35, 41, 44, 50, 57, 63, 68, 74];
export const ARRAY_32: readonly number[] = [
  1, 4, 6, 9, 13, 15, 18, 22, 25, 27, 31, 34, 38, 40, 43, 47, 50, 52, 56, 59, 61, 64, 68, 71, 73, 77, 80, 84, 86,
  89, 93, 96,
];

/** Linear default: n = 32 and an absent target, the worst case (32 comparisons). */
export const SEARCH_DEFAULT_LINEAR: SearchInput = { op: "linear", values: ARRAY_32, target: 60 };
/** Binary default: the same array, target 71 at index 23 (6 comparisons). */
export const SEARCH_DEFAULT_BINARY: SearchInput = { op: "binary", values: ARRAY_32, target: 71 };

export const SEARCH_PRESETS: readonly InputPreset<SearchInput>[] = [
  { id: "linear-first", label: "Linear, target at the start", value: { op: "linear", values: ARRAY_16, target: 2 } },
  { id: "linear-last", label: "Linear, target at the end", value: { op: "linear", values: ARRAY_16, target: 74 } },
  { id: "linear-absent", label: "Linear, target absent", value: { op: "linear", values: ARRAY_16, target: 40 } },
  { id: "binary-8", label: "Binary, n = 8", value: { op: "binary", values: ARRAY_8, target: 20 } },
  { id: "binary-16", label: "Binary, n = 16", value: { op: "binary", values: ARRAY_16, target: 60 } },
  { id: "binary-32", label: "Binary, n = 32", value: { op: "binary", values: ARRAY_32, target: 60 } },
];

/** "Random" preset: 6..32 increasing numbers, the target present 2 times out of 3. */
export function randomSearchInput(seed: number, op: SearchOp): SearchInput {
  const rng = mulberry32(seed);
  const n = randomInt(rng, 6, 32);
  const values: number[] = [];
  let v = randomInt(rng, -20, 20);
  for (let k = 0; k < n; k++) {
    values.push(v);
    v += randomInt(rng, 1, 6);
  }
  const target = rng() < 2 / 3 ? (values[randomInt(rng, 0, n - 1)] as number) : (values[n - 1] as number) + 1;
  return { op, values, target };
}
