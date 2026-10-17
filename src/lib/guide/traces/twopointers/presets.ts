import type { InputPreset } from "../../contracts";
import { mulberry32, randomInt } from "../../random";

import type { MergeInput } from "./types";

/** The course example (p15-16): C = [1, 2, 3, 5, 6, 7, 8, 9, 10, 13]; A runs out first. */
export const MERGE_DEFAULT: MergeInput = { a: [1, 3, 5, 8, 10], b: [2, 6, 7, 9, 13] };

export const MERGE_PRESETS: readonly InputPreset<MergeInput>[] = [
  { id: "b-runs-out", label: "B runs out first", value: { a: [4, 9, 12, 20], b: [1, 5, 7] } },
  { id: "no-overlap", label: "All of A first", value: { a: [1, 2, 3], b: [7, 8, 9] } },
  { id: "ties", label: "Equal values", value: { a: [2, 4, 4, 8], b: [4, 6, 8] } },
  { id: "one-empty", label: "A is empty", value: { a: [], b: [3, 6, 9] } },
];

function sortedList(rng: () => number, len: number): number[] {
  const out: number[] = [];
  let v = randomInt(rng, 0, 10);
  for (let k = 0; k < len; k++) {
    out.push(v);
    v += randomInt(rng, 0, 7);
  }
  return out;
}

/** "Random" preset: two sorted lists of 2..7 numbers. */
export function randomMergeInput(seed: number): MergeInput {
  const rng = mulberry32(seed);
  return { a: sortedList(rng, randomInt(rng, 2, 7)), b: sortedList(rng, randomInt(rng, 2, 7)) };
}
