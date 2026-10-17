"use client";

import type { RendererProps } from "@/components/guide/player/TracePlayer";
import { Cell } from "@/components/guide/svg/Cell";
import { PointerTag } from "@/components/guide/svg/PointerTag";
import { VizSvg } from "@/components/guide/svg/VizSvg";
import type { ElementId } from "@/lib/guide/contracts";
import type { RowLayout } from "@/lib/guide/layout/row";
import { textWidth } from "@/lib/guide/layout/text";
import type { MergeCell, MergeState } from "@/lib/guide/traces/twopointers/model";

import { balancedRowLayout } from "../array/balanced-row";

const PAD = 12;
const HEADER = 22;
const LABEL_W = 22; // "A" / "B" / "C" row names
const GAP = 4;
const INDEX = 20; // index labels under a row
const TAG = 46; // pointer tag under the index labels
const SECTION_GAP = 10;

interface Section {
  readonly name: "A" | "B" | "C";
  readonly cells: readonly (MergeCell | null)[];
  readonly layout: RowLayout;
  readonly top: number;
  readonly height: number;
  readonly pointer: { label: string; index: number } | null;
}

/** Lists A and B with pointers i and j above the output C, which fills left to right. */
export function MergeRenderer({ frame, width, hovered, onHover, mode }: RendererProps<MergeState>) {
  const thumb = mode === "thumb";
  const s = frame.state;
  const all = [...s.a, ...s.b];
  const longest = Math.max(1, ...all.map((c) => String(c.value).length));
  const minCell = Math.max(32, Math.ceil(textWidth("0".repeat(longest), 14) + 8));
  const labelW = thumb ? 0 : LABEL_W;
  const inner = Math.max(40, width - 2 * PAD - labelW);
  // One cell size for all rows: the one that fits the longest row (C).
  const cellW = balancedRowLayout(Math.max(1, s.c.length), inner, { minCell, maxCell: Math.max(minCell, thumb ? 36 : 48), gap: GAP }).cellW;
  const index = thumb ? 4 : INDEX;
  const tag = thumb ? 34 : TAG;

  const sections: Section[] = [];
  let y = PAD + (thumb ? 0 : HEADER) + 4;
  const add = (
    name: Section["name"],
    cells: readonly (MergeCell | null)[],
    pointer: Section["pointer"],
  ) => {
    const below = index + (pointer ? tag : 12); // 12: room for the "done" badges of a wrapped C
    const layout = balancedRowLayout(Math.max(1, cells.length), inner, { minCell: cellW, maxCell: cellW, gap: GAP, rowGap: below });
    const height = layout.height + below;
    sections.push({ name, cells, layout, top: y, height, pointer });
    y += height + SECTION_GAP;
  };
  add("A", s.a, { label: "i", index: s.i });
  add("B", s.b, { label: "j", index: s.j });
  add("C", s.c, null);
  const height = y - SECTION_GAP + PAD;
  const left = PAD + labelW;

  let title = "Merge A and B into C";
  if (s.ranOut) title = `${s.ranOut} ran out: copy the rest of ${s.ranOut === "A" ? "B" : "A"}`;

  const tagFor = (sec: Section) => {
    const p = sec.pointer;
    if (!p || sec.cells.length === 0) return null;
    const k = Math.min(p.index, sec.cells.length - 1);
    const pos = sec.layout.positions[k];
    if (!pos) return null;
    // Past the end: the tag sits on the right edge of the last cell.
    const x = left + pos.x + (p.index >= sec.cells.length ? cellW + GAP / 2 : cellW / 2);
    const label = p.index >= sec.cells.length ? `${p.label} (end)` : p.label;
    const half = textWidth(label, 13) / 2 + 2;
    return (
      <PointerTag
        key={`tag-${sec.name}`}
        label={label}
        x={Math.min(Math.max(x, half), width - half)}
        y={sec.top + pos.y + cellW + index + 2}
        side="below"
        thumb={thumb}
      />
    );
  };

  return (
    <VizSvg width={width} height={height}>
      {!thumb && (
        <text className="viz-label" x={PAD} y={PAD + 12}>
          {title}
        </text>
      )}
      {sections.map((sec) => (
        <g key={sec.name}>
          {!thumb && (
            <text className="viz-label" x={PAD} y={sec.top + cellW / 2} dy="0.35em">
              {sec.name}
            </text>
          )}
          {sec.cells.length === 0 && !thumb && (
            <text className="viz-label" x={left} y={sec.top + cellW / 2} dy="0.35em">
              (empty)
            </text>
          )}
          {sec.cells.map((cell, k) => {
            const pos = sec.layout.positions[k];
            if (!pos) return null;
            const x = left + pos.x;
            const cy = sec.top + pos.y;
            if (cell) {
              const id: ElementId = cell.id;
              return (
                <Cell
                  key={id}
                  id={id}
                  x={x}
                  y={cy}
                  w={cellW}
                  h={cellW}
                  value={cell.value}
                  role={frame.roles[id]}
                  sub={thumb ? undefined : k}
                  thumb={thumb}
                  hovered={hovered === id}
                  onHover={thumb ? undefined : onHover}
                />
              );
            }
            return (
              <g key={`${sec.name}-slot-${k}`} data-empty-slot="" transform={`translate(${x}, ${cy})`}>
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
          {tagFor(sec)}
        </g>
      ))}
    </VizSvg>
  );
}
