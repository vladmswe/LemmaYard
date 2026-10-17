"use client";

import type { RendererProps } from "@/components/guide/player/TracePlayer";
import { Cell } from "@/components/guide/svg/Cell";
import { RoleShape } from "@/components/guide/svg/RoleShape";
import { VizSvg } from "@/components/guide/svg/VizSvg";
import { ARRAY_ID, type ArrayState } from "@/lib/guide/traces/array/model";

import { balancedRowLayout } from "./balanced-row";

const PAD = 12;
const FRAME = 10; // space between the array outline and its cells
const HEADER = 22;
const MARKER = 16; // room above a row for the "current" marker
const INDEX = 20; // index labels under a row
const GAP = 4;

/** Fixed-capacity array: one box per slot, empty slots dashed, the whole buffer outlined. */
export function ArrayRenderer({ frame, width, hovered, onHover, mode }: RendererProps<ArrayState>) {
  const thumb = mode === "thumb";
  const s = frame.state;
  const inner = Math.max(40, width - 2 * PAD - 2 * FRAME);
  const layout = balancedRowLayout(s.capacity, inner, {
    minCell: 32,
    maxCell: thumb ? 36 : 52,
    gap: GAP,
    rowGap: MARKER + (thumb ? 4 : INDEX) + 6,
  });
  const cellW = layout.cellW;
  const header = thumb ? 0 : HEADER;
  const boxTop = PAD + header + 8;
  const top = boxTop + FRAME + MARKER;
  const left = PAD + FRAME;
  const boxH = MARKER + layout.height + (thumb ? 4 : INDEX) + FRAME * 2;
  const boxLeft = PAD + Math.max(0, (inner - layout.usedWidth) / 2);
  const boxW = layout.usedWidth + 2 * FRAME;
  const height = boxTop + boxH + 18 + PAD; // 18: the error cue under the box
  const role = frame.roles[ARRAY_ID];

  return (
    <VizSvg width={width} height={height}>
      {!thumb && (
        <text className="viz-label" x={PAD} y={PAD + 12}>
          {`Size ${s.size}/${s.capacity}${s.op ? ` · ${s.op}` : ""}`}
        </text>
      )}
      <g
        data-id={thumb ? undefined : ARRAY_ID}
        data-role={role ?? undefined}
        transform={`translate(${boxLeft}, ${boxTop})`}
      >
        <RoleShape shape={{ kind: "rect", w: boxW, h: boxH, rx: 10 }} role={role} thumb={thumb} />
      </g>
      {s.slots.map((it, k) => {
        const p = layout.positions[k];
        if (!p) return null;
        const x = left + p.x;
        const y = top + p.y;
        if (it) {
          return (
            <Cell
              key={it.id}
              id={it.id}
              x={x}
              y={y}
              w={cellW}
              h={cellW}
              value={it.value}
              role={frame.roles[it.id]}
              sub={thumb ? undefined : k}
              thumb={thumb}
              hovered={hovered === it.id}
              onHover={thumb ? undefined : onHover}
            />
          );
        }
        return (
          <g key={`slot-${k}`} data-empty-slot="" transform={`translate(${x}, ${y})`}>
            <rect
              width={cellW}
              height={cellW}
              rx={6}
              fill="none"
              stroke="var(--viz-node-border)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
            {!thumb && (
              <text className="viz-label" x={cellW / 2} y={cellW + 15} textAnchor="middle">
                {k}
              </text>
            )}
          </g>
        );
      })}
    </VizSvg>
  );
}
