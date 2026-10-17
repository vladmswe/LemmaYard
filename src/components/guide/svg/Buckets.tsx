import type { ElementId, Role } from "@/lib/guide/contracts";

import { Arrow } from "./Arrow";
import { Cell } from "./Cell";

export interface Bucket {
  readonly id: ElementId;
  readonly items: readonly { readonly id: ElementId; readonly label: string | number }[];
}

/**
 * Hash-table buckets with separate chaining. "vertical": bucket slots stacked
 * top to bottom, each chain running to the right; "horizontal": slots side by
 * side, chains running down.
 */
export function Buckets({
  buckets,
  x = 0,
  y = 0,
  cell = 40,
  gap = 8,
  orientation = "vertical",
  roles = {},
  thumb = false,
}: {
  buckets: readonly Bucket[];
  x?: number;
  y?: number;
  cell?: number;
  gap?: number;
  orientation?: "vertical" | "horizontal";
  roles?: Readonly<Record<ElementId, Role>>;
  thumb?: boolean;
}) {
  const link = 20; // arrow length between chain items
  return (
    <g data-buckets="">
      {buckets.map((b, k) => {
        const bx = orientation === "vertical" ? x : x + k * (cell + gap);
        const by = orientation === "vertical" ? y + k * (cell + gap) : y;
        return (
          <g key={b.id}>
            <Cell id={b.id} x={bx} y={by} w={cell} h={cell} value={k} role={roles[b.id]} thumb={thumb} />
            {b.items.map((it, j) => {
              const step = cell + link;
              const ix = orientation === "vertical" ? bx + (j + 1) * step : bx;
              const iy = orientation === "vertical" ? by : by + (j + 1) * step;
              const from =
                orientation === "vertical"
                  ? { x: ix - link, y: iy + cell / 2 }
                  : { x: ix + cell / 2, y: iy - link };
              const to = orientation === "vertical" ? { x: ix, y: iy + cell / 2 } : { x: ix + cell / 2, y: iy };
              return (
                <g key={it.id}>
                  <Arrow from={from} to={to} thumb={thumb} />
                  <Cell id={it.id} x={ix} y={iy} w={cell} h={cell} value={it.label} role={roles[it.id]} thumb={thumb} />
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}
