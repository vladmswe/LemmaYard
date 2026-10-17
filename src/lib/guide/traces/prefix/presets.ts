import type { InputPreset } from "../../contracts";
import { mulberry32, randomInt } from "../../random";

import type { PrefixInput } from "./types";

const EIGHT: readonly number[] = [3, 1, 4, 1, 5, 9, 2, 6];

/** Default: sum of [2, 5) = 4 + 1 + 5 = 10 = p[5] - p[2] = 14 - 4. */
export const PREFIX_DEFAULT: PrefixInput = { values: EIGHT, l: 2, r: 5 };

export const PREFIX_PRESETS: readonly InputPreset<PrefixInput>[] = [
  { id: "from-start", label: "Range from index 0", value: { values: EIGHT, l: 0, r: 4 } },
  { id: "whole", label: "Whole array", value: { values: EIGHT, l: 0, r: 8 } },
  { id: "empty", label: "Empty range", value: { values: EIGHT, l: 3, r: 3 } },
  { id: "negatives", label: "With negatives", value: { values: [5, -2, 7, -8, 4, -1, 3], l: 1, r: 6 } },
];

/** "Random" preset: 4..12 numbers from -20 to 50 and a random range. */
export function randomPrefixInput(seed: number): PrefixInput {
  const rng = mulberry32(seed);
  const n = randomInt(rng, 4, 12);
  const values = Array.from({ length: n }, () => randomInt(rng, -20, 50));
  const x = randomInt(rng, 0, n);
  const y = randomInt(rng, 0, n);
  return { values, l: Math.min(x, y), r: Math.max(x, y) };
}
