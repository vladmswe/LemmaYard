import type { ElementId } from "../../contracts";

import type { SearchItem } from "./model";

export function itemId(k: number): ElementId {
  return `c${k}`;
}

export function toItems(values: readonly number[]): SearchItem[] {
  return values.map((value, k) => ({ id: itemId(k), value }));
}
