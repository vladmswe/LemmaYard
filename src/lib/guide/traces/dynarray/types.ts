import type { ElementId } from "../../contracts";

export interface DynCell {
  readonly id: ElementId; // "<buffer id>s<slot>", e.g. "b2s5"
  readonly value: number;
}

export interface DynBuffer {
  readonly id: ElementId; // "b0", "b1", ... one per allocation
  readonly capacity: number;
  readonly slots: readonly (DynCell | null)[];
}

export type Growth = 2 | 1.5;
/** "quarter": shrink to half when size <= capacity / 4. "half": when size <= capacity / 2 (thrashes). */
export type ShrinkPolicy = "quarter" | "half";

export type DynOp = { readonly kind: "append"; readonly value: number } | { readonly kind: "pop" };

export interface DynInput {
  readonly initialCapacity: 1 | 2 | 4;
  readonly growth: Growth;
  readonly shrink: ShrinkPolicy;
  readonly ops: readonly DynOp[];
}

export interface DynState {
  readonly buffer: DynBuffer;
  /** The new buffer while a resize copies into it; null otherwise. */
  readonly next: DynBuffer | null;
  readonly size: number;
  readonly minCapacity: number;
  readonly growth: Growth;
  readonly shrink: ShrinkPolicy;
  /** Cost of every finished op (writes + copies); failed ops are not listed. */
  readonly costs: readonly number[];
  /** Op in progress or just finished, e.g. "append 7"; null on the first and last frame. */
  readonly op: string | null;
  /** Ops finished so far (failed ones included). */
  readonly completed: number;
}

export const DYN_MAX_OPS = 20;
export const DYN_MIN = -99;
export const DYN_MAX = 999;
export const DYN_CAPACITIES = [1, 2, 4] as const;

export const DYN_LINES = [
  "dynarray.append.grow",
  "dynarray.append.write",
  "dynarray.pop.empty",
  "dynarray.pop.read",
  "dynarray.pop.shrink",
  "dynarray.resize.alloc",
  "dynarray.resize.copy",
  "dynarray.resize.swap",
] as const;

/** Next capacity when full: x2, or x1.5 rounded down (at least one more slot). */
export function grownCapacity(cap: number, growth: Growth): number {
  return growth === 2 ? cap * 2 : Math.max(cap + 1, Math.floor(cap * 1.5));
}

/** Capacity after a pop that leaves `size` elements, or null if the array keeps its capacity. */
export function shrunkCapacity(size: number, cap: number, minCap: number, policy: ShrinkPolicy): number | null {
  const half = Math.floor(cap / 2);
  if (half < minCap) return null;
  const limit = policy === "quarter" ? 4 * size <= cap : 2 * size <= cap;
  return limit ? half : null;
}
