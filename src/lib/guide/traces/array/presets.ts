import type { InputPreset } from "../../contracts";
import { mulberry32, randomInt } from "../../random";

import type { ArrayInput, ArrayOp } from "./types";

const SIX: readonly number[] = [3, 8, 1, 9, 4, 6];

/** Default: insert at index 1 of a 6-element array (5 moves), then remove index 0 (6 moves). */
export const ARRAY_DEFAULT: ArrayInput = {
  values: SIX,
  ops: [
    { kind: "insert", index: 1, value: 7 },
    { kind: "remove", index: 0 },
  ],
};

export const ARRAY_PRESETS: readonly InputPreset<ArrayInput>[] = [
  { id: "insert-front", label: "Insert at the front", value: { values: SIX, ops: [{ kind: "insert", index: 0, value: 5 }] } },
  { id: "insert-end", label: "Insert at the end", value: { values: SIX, ops: [{ kind: "insert", index: 6, value: 5 }] } },
  { id: "remove-front", label: "Remove the first", value: { values: SIX, ops: [{ kind: "remove", index: 0 }] } },
  {
    id: "full",
    label: "Full array",
    value: {
      values: [12, 15, 21, 30, 33, 40, 47, 52, 58, 61],
      ops: [
        { kind: "insert", index: 3, value: 25 },
        { kind: "remove", index: 9 },
        { kind: "insert", index: 3, value: 25 },
      ],
    },
  },
  {
    id: "bad-index",
    label: "Bad indices",
    value: {
      values: [],
      ops: [
        { kind: "remove", index: 0 },
        { kind: "insert", index: 1, value: 5 },
        { kind: "insert", index: 0, value: 5 },
      ],
    },
  },
];

/** "Random" preset: 3..8 numbers and 1..4 valid ops. */
export function randomArrayInput(seed: number): ArrayInput {
  const rng = mulberry32(seed);
  const n = randomInt(rng, 3, 8);
  const values = Array.from({ length: n }, () => randomInt(rng, 1, 60));
  let size = n;
  const ops: ArrayOp[] = [];
  const count = randomInt(rng, 1, 4);
  for (let k = 0; k < count; k++) {
    if (size < 10 && (size === 0 || rng() < 0.5)) {
      ops.push({ kind: "insert", index: randomInt(rng, 0, size), value: randomInt(rng, 1, 60) });
      size++;
    } else {
      ops.push({ kind: "remove", index: randomInt(rng, 0, size - 1) });
      size--;
    }
  }
  return { values, ops };
}
