"use client";

import type { RendererProps } from "@/components/guide/player/TracePlayer";
import { Cell } from "@/components/guide/svg/Cell";
import { PointerTag } from "@/components/guide/svg/PointerTag";
import { RoleShape } from "@/components/guide/svg/RoleShape";
import { VizSvg } from "@/components/guide/svg/VizSvg";
import type { StackState } from "@/lib/guide/traces/stack/model";

import { balancedRowLayout } from "../array/balanced-row";

const PAD = 12;
const FRAME = 10; // space between the array outline and its cells
const HEADER = 40; // two text lines
const MARKER = 16; // room above a row for the "current" marker
const INDEX = 20; // index labels under a row
const TAG = 40; // the "top" tag under the index labels
const GAP = 4;

function outText(s: StackState): string {
  if (s.out === null) return "";
  return s.out === "error" ? " · failed: empty" : ` · returned ${s.out}`;
}

/**
 * Array-backed stack: slot 0 (the bottom) on the left, the top growing to the
 * right, a "top" tag under the top element, empty slots dashed.
 */
export function StackRenderer({ frame, width, hovered, onHover, mode }: RendererProps<StackState>) {
  const thumb = mode === "thumb";
  const s = frame.state;
  const inner = Math.max(40, width - 2 * PAD - 2 * FRAME);
  const below = thumb ? 4 : INDEX + TAG;
  const layout = balancedRowLayout(s.capacity, inner, {
    minCell: 32,
    maxCell: thumb ? 36 : 52,
    gap: GAP,
    rowGap: MARKER + below + 6,
  });
  const cellW = layout.cellW;
  const header = thumb ? 0 : HEADER;
  const boxTop = PAD + header + 8;
  const top = boxTop + FRAME + MARKER;
  const left = PAD + FRAME;
  const boxH = MARKER + layout.height + below + FRAME * 2;
  const boxLeft = PAD + Math.max(0, (inner - layout.usedWidth) / 2);
  const boxW = layout.usedWidth + 2 * FRAME;
  const height = boxTop + boxH + 18 + PAD; // 18: the error cue under the box
  const role = frame.roles[s.bufferId];
  const topId = frame.pointers?.top ?? null;

  return (
    <VizSvg width={width} height={height}>
      {!thumb && (
        <>
          <text className="viz-label" x={PAD} y={PAD + 12}>
            {`Size ${s.size}/${s.capacity} · top = ${s.top} · bottom = 0`}
          </text>
          <text className="viz-label" x={PAD} y={PAD + 30}>
            {s.op ? `${s.op}${outText(s)}` : s.completed ? "All ops done" : "No op yet"}
          </text>
        </>
      )}
      <g data-id={thumb ? undefined : s.bufferId} data-role={role ?? undefined} transform={`translate(${boxLeft}, ${boxTop})`}>
        <RoleShape shape={{ kind: "rect", w: boxW, h: boxH, rx: 10 }} role={role} thumb={thumb} />
      </g>
      {s.slots.map((it, k) => {
        const p = layout.positions[k];
        if (!p) return null;
        const x = left + p.x;
        const y = top + p.y;
        const shown = it ?? (s.popped && k === s.size ? s.popped : null);
        if (shown) {
          return (
            <g key={shown.id}>
              <Cell
                id={shown.id}
                x={x}
                y={y}
                w={cellW}
                h={cellW}
                value={shown.value}
                role={frame.roles[shown.id]}
                sub={thumb ? undefined : k}
                thumb={thumb}
                hovered={hovered === shown.id}
                onHover={thumb ? undefined : onHover}
              />
              {!thumb && shown.id === topId && <PointerTag label="top" x={x + cellW / 2} y={y + cellW + 20} side="below" />}
            </g>
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
