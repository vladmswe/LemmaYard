import type { ElementId } from "../../contracts";

export interface PrefixCell {
  readonly id: ElementId;
  readonly value: number;
}

export interface PrefixState {
  readonly a: readonly PrefixCell[]; // ids a0..a(n-1)
  /** n + 1 cells; null = not built yet. p[i] = a[0] + ... + a[i-1]; ids p0..pn. */
  readonly p: readonly (PrefixCell | null)[];
  /** The query range [l, r). */
  readonly l: number;
  readonly r: number;
  /** Answer of the query on the last frame; null before. */
  readonly result: number | null;
}

export interface PrefixInput {
  readonly values: readonly number[];
  readonly l: number;
  readonly r: number;
}

export const PREFIX_MAX_VALUES = 12;
export const PREFIX_MIN = -99;
export const PREFIX_MAX = 999;

export const PREFIX_LINES = ["prefix.build.init", "prefix.build.step", "prefix.query"] as const;
