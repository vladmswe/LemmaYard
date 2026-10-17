import type { ElementId, Role } from "@/lib/guide/contracts";

import { Cell } from "./Cell";

export interface ArrayRowItem {
  readonly id: ElementId;
  readonly value: string | number;
}

export interface ArrayRowProps {
  readonly items: readonly ArrayRowItem[];
  readonly x: number;
  readonly y: number;
  readonly cellW: number;
  readonly cellH?: number; // default cellW
  readonly gap?: number; // default 4
  readonly roles?: Readonly<Record<ElementId, Role>>;
  readonly showIndices?: boolean;
  readonly indexBase?: number; // default 0
  /** Total slots; slots past items.length are drawn empty with a dashed outline. */
  readonly capacity?: number;
  /** Slot positions relative to (x, y), e.g. rowLayout().positions for wrapping rows. */
  readonly positions?: readonly { readonly x: number; readonly y: number }[];
  readonly thumb?: boolean;
  readonly hovered?: ElementId | null;
  readonly onHover?: (id: ElementId | null) => void;
}

/** A row of cells. Cells are keyed by element id, so a value that moves glides to its new slot. */
export function ArrayRow({
  items,
  x,
  y,
  cellW,
  cellH = cellW,
  gap = 4,
  roles = {},
  showIndices = false,
  indexBase = 0,
  capacity,
  positions,
  thumb = false,
  hovered = null,
  onHover,
}: ArrayRowProps) {
  const slots = Math.max(items.length, capacity ?? 0);
  const at = (k: number) => {
    const p = positions?.[k];
    return p ? { x: x + p.x, y: y + p.y } : { x: x + k * (cellW + gap), y };
  };
  const empty: number[] = [];
  for (let k = items.length; k < slots; k++) empty.push(k);
  return (
    <g data-array-row="">
      {empty.map((k) => {
        const p = at(k);
        return (
          <g key={`slot-${k}`} data-empty-slot="" transform={`translate(${p.x}, ${p.y})`}>
            <rect
              width={cellW}
              height={cellH}
              rx={6}
              fill="none"
              stroke="var(--viz-node-border)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
            {showIndices && (
              <text className="viz-label" x={cellW / 2} y={cellH + 15} textAnchor="middle">
                {k + indexBase}
              </text>
            )}
          </g>
        );
      })}
      {items.map((it, k) => {
        const p = at(k);
        return (
          <Cell
            key={it.id}
            id={it.id}
            x={p.x}
            y={p.y}
            w={cellW}
            h={cellH}
            value={it.value}
            role={roles[it.id]}
            sub={showIndices ? k + indexBase : undefined}
            thumb={thumb}
            hovered={hovered === it.id}
            onHover={onHover}
          />
        );
      })}
    </g>
  );
}
