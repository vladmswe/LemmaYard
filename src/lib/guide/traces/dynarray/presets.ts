import type { InputPreset } from "../../contracts";
import { mulberry32, randomInt } from "../../random";

import type { DynInput, DynOp } from "./types";

const appends = (values: readonly number[]): DynOp[] => values.map((value) => ({ kind: "append", value }));
const pops = (count: number): DynOp[] => Array.from({ length: count }, () => ({ kind: "pop" }));
const range = (from: number, to: number): number[] => Array.from({ length: to - from + 1 }, (_, k) => from + k);
const thrash = (): DynOp[] => [
  ...appends(range(1, 8)),
  ...Array.from({ length: 6 }, (): DynOp[] => [{ kind: "append", value: 9 }, { kind: "pop" }]).flat(),
];

/** Default: five appends (grows 1 -> 2 -> 4 -> 8), then three pops (shrinks 8 -> 4 at size 2). */
export const DYN_DEFAULT: DynInput = {
  initialCapacity: 1,
  growth: 2,
  shrink: "quarter",
  ops: [...appends([3, 8, 1, 9, 4]), ...pops(3)],
};

export const DYN_PRESETS: readonly InputPreset<DynInput>[] = [
  {
    id: "append-17",
    label: "Append 1..17",
    value: { initialCapacity: 1, growth: 2, shrink: "quarter", ops: appends(range(1, 17)) },
  },
  {
    id: "thrash",
    label: "Thrash at the boundary (shrink at 1/2)",
    value: { initialCapacity: 4, growth: 2, shrink: "half", ops: thrash() },
  },
  {
    id: "no-thrash",
    label: "Same ops, shrink at 1/4",
    value: { initialCapacity: 4, growth: 2, shrink: "quarter", ops: thrash() },
  },
  {
    id: "pop-to-shrink",
    label: "Pop to shrink",
    value: { initialCapacity: 1, growth: 2, shrink: "quarter", ops: [...appends(range(1, 8)), ...pops(8)] },
  },
  {
    id: "grow-1-5",
    label: "Grow x1.5",
    value: { initialCapacity: 1, growth: 1.5, shrink: "quarter", ops: appends(range(1, 12)) },
  },
  {
    id: "pop-empty",
    label: "Pop on empty",
    value: { initialCapacity: 2, growth: 2, shrink: "quarter", ops: [...appends([5]), ...pops(2)] },
  },
];

/** "Random" preset: 6..16 ops, mostly appends, with the default policy. */
export function randomDynInput(seed: number): DynInput {
  const rng = mulberry32(seed);
  const count = randomInt(rng, 6, 16);
  const ops: DynOp[] = [];
  for (let k = 0; k < count; k++) {
    ops.push(rng() < 0.7 ? { kind: "append", value: randomInt(rng, 1, 99) } : { kind: "pop" });
  }
  return { initialCapacity: 1, growth: 2, shrink: "quarter", ops };
}
