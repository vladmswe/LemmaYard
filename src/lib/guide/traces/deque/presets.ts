import type { InputPreset } from "../../contracts";
import { mulberry32, randomInt } from "../../random";

import type { DequeInput, DequeOp } from "./types";

const push = (kind: "pushFront" | "pushBack", values: readonly number[]): DequeOp[] => values.map((value) => ({ kind, value }));

/**
 * Default: pushBack 10 20 30, then pushFront wraps head from 0 to 7 and keeps
 * stepping back until all 8 slots are full (head = 3 = tail); pushFront 0
 * grows the ring, then one pop from each end.
 */
export const DEQUE_DEFAULT: DequeInput = {
  ops: [...push("pushBack", [10, 20, 30]), ...push("pushFront", [5, 4, 3, 2, 1, 0]), { kind: "popBack" }, { kind: "popFront" }],
};

export const DEQUE_PRESETS: readonly InputPreset<DequeInput>[] = [
  { id: "front-only", label: "Push at the front only", value: { ops: push("pushFront", [1, 2, 3, 4]) } },
  {
    id: "both-ends",
    label: "Take from both ends",
    value: {
      ops: [...push("pushBack", [1, 2, 3, 4, 5]), { kind: "popFront" }, { kind: "popBack" }, { kind: "popFront" }, { kind: "popBack" }],
    },
  },
  {
    id: "empty",
    label: "Pop on empty",
    value: { ops: [{ kind: "popFront" }, { kind: "popBack" }, ...push("pushBack", [7]), { kind: "popBack" }] },
  },
  { id: "grow-back", label: "Grow from the back", value: { ops: [...push("pushFront", [1, 2]), ...push("pushBack", [3, 4, 5, 6, 7, 8, 9])] } },
];

/** "Random" preset: 8..16 ops, a bit more pushes than pops. */
export function randomDequeInput(seed: number): DequeInput {
  const rng = mulberry32(seed);
  const count = randomInt(rng, 8, 16);
  const ops: DequeOp[] = [];
  for (let k = 0; k < count; k++) {
    const r = rng();
    const value = randomInt(rng, 1, 99);
    ops.push(r < 0.3 ? { kind: "pushFront", value } : r < 0.6 ? { kind: "pushBack", value } : r < 0.8 ? { kind: "popFront" } : { kind: "popBack" });
  }
  return { ops };
}
