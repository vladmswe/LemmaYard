import type { ElementId } from "../../contracts";

export interface MergeCell {
  readonly id: ElementId;
  readonly value: number;
}

export interface MergeState {
  readonly a: readonly MergeCell[]; // ids a0..
  readonly b: readonly MergeCell[]; // ids b0..
  /** Output, |A| + |B| slots; null = not written yet. ids c0.. */
  readonly c: readonly (MergeCell | null)[];
  readonly i: number; // first unused index of A
  readonly j: number; // first unused index of B
  /** Which input ran out first, once the main loop has ended. */
  readonly ranOut: "A" | "B" | null;
}

export interface MergeInput {
  readonly a: readonly number[];
  readonly b: readonly number[];
}

export const MERGE_MAX_EACH = 8;
export const MERGE_MIN = -99;
export const MERGE_MAX = 999;

export const MERGE_LINES = ["merge.compare", "merge.takeA", "merge.takeB", "merge.restA", "merge.restB"] as const;
