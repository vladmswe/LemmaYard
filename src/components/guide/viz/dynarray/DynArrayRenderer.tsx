"use client";

import type { ReactNode } from "react";

import type { RendererProps } from "@/components/guide/player/TracePlayer";
import { Cell } from "@/components/guide/svg/Cell";
import { RoleShape } from "@/components/guide/svg/RoleShape";
import { VizSvg } from "@/components/guide/svg/VizSvg";
import type { ElementId, Role } from "@/lib/guide/contracts";
import { rowLayout } from "@/lib/guide/layout/row";
import { DYN_MAX_OPS, formatAverage, type DynBuffer, type DynState } from "@/lib/guide/traces/dynarray/model";

const PAD = 12;
const FRAME = 8; // space between a buffer outline and its cells
const HEADER = 40; // two lines: size / capacity, then the policy
const CAPTION = 20; // "Buffer, 8 slots" above each buffer
const INDEX = 18; // index labels under a row
const GAP = 4;
const CHART_H = 64;

function policyText(s: DynState): string {
  return `Grows x${s.growth} · shrinks at ${s.shrink === "quarter" ? "1/4" : "1/2"}`;
}

/**
 * Buffer(s) of a dynamic array (a second one appears while a resize copies
 * into it) and, below, the cost of every op so far with its running average.
 */
export function DynArrayRenderer({ frame, width, hovered, onHover, mode }: RendererProps<DynState>) {
  const thumb = mode === "thumb";
  const s = frame.state;
  const inner = Math.max(40, width - 2 * PAD - 2 * FRAME);
  const index = thumb ? 2 : INDEX;
  const parts: ReactNode[] = [];
  let y = PAD + (thumb ? 0 : HEADER);

  const drawBuffer = (buf: DynBuffer, caption: string, size: number) => {
    const layout = rowLayout(buf.capacity, inner, { minCell: 32, maxCell: thumb ? 32 : 44, gap: GAP, rowGap: index + 10 });
    const cellW = layout.cellW;
    if (!thumb) {
      parts.push(
        <text key={`cap-${buf.id}`} className="viz-label" x={PAD} y={y + 13}>
          {caption}
        </text>,
      );
      y += CAPTION;
    }
    const role: Role | undefined = frame.roles[buf.id];
    const boxLeft = PAD + Math.max(0, (inner - layout.usedWidth) / 2);
    const boxW = layout.usedWidth + 2 * FRAME;
    const boxTop = y + 12; // room for the "current" marker above the outline
    const boxH = layout.height + index + 2 * FRAME;
    parts.push(
      <g
        key={`box-${buf.id}`}
        data-id={thumb ? undefined : buf.id}
        data-role={role ?? undefined}
        transform={`translate(${boxLeft}, ${boxTop})`}
      >
        <RoleShape shape={{ kind: "rect", w: boxW, h: boxH, rx: 10 }} role={role} thumb={thumb} />
      </g>,
    );
    buf.slots.forEach((cell, k) => {
      const p = layout.positions[k];
      if (!p) return;
      const x = PAD + FRAME + p.x;
      const cy = boxTop + FRAME + p.y;
      if (cell) {
        const id: ElementId = cell.id;
        parts.push(
          <Cell
            key={id}
            id={id}
            x={x}
            y={cy}
            w={cellW}
            h={cellW}
            value={cell.value}
            role={frame.roles[id] ?? (k >= size ? "muted" : undefined)}
            sub={thumb ? undefined : k}
            thumb={thumb}
            hovered={hovered === id}
            onHover={thumb ? undefined : onHover}
          />,
        );
        return;
      }
      parts.push(
        <g key={`${buf.id}-slot-${k}`} data-empty-slot="" transform={`translate(${x}, ${cy})`}>
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
        </g>,
      );
    });
    y = boxTop + boxH + 20; // 20: the error cue under the outline
  };

  drawBuffer(s.buffer, `Buffer, ${s.buffer.capacity} slot${s.buffer.capacity === 1 ? "" : "s"}`, s.size);
  if (s.next) drawBuffer(s.next, `New buffer, ${s.next.capacity} slots`, s.size);

  if (!thumb) {
    // Cost chart: one bar per finished op (1 write at the bottom, copies on top), average as a line.
    const costs = s.costs;
    const maxCost = Math.max(4, ...costs);
    const chartW = width - 2 * PAD - 16; // 16: axis labels on the left
    const slot = chartW / DYN_MAX_OPS;
    const barW = Math.max(3, slot - 3);
    const x0 = PAD + 16;
    parts.push(
      <text key="chart-title" className="viz-label" x={PAD} y={y + 12}>
        {costs.length ? `Cost per op · average ${formatAverage(costs)}` : "Cost per op"}
      </text>,
    );
    const base = y + 24 + CHART_H;
    const yOf = (v: number) => base - (v / maxCost) * CHART_H;
    parts.push(
      <g key="chart-axes">
        <line x1={x0} y1={base} x2={x0 + chartW} y2={base} stroke="var(--viz-node-border)" strokeWidth={1} />
        <line
          x1={x0}
          y1={yOf(3)}
          x2={x0 + chartW}
          y2={yOf(3)}
          stroke="var(--viz-label)"
          strokeWidth={1}
          strokeDasharray="3 4"
        />
        <text className="viz-label" x={PAD} y={yOf(3)} dy="0.35em">
          3
        </text>
        <text className="viz-label" x={PAD} y={base} dy="0.35em">
          0
        </text>
      </g>,
    );
    let sum = 0;
    let prev: { x: number; y: number } | null = null;
    costs.forEach((c, k) => {
      sum += c;
      const bx = x0 + k * slot + (slot - barW) / 2;
      const writeTop = yOf(1);
      parts.push(
        <g key={`bar-${k}`} data-cost-bar={c}>
          <rect
            x={bx}
            y={writeTop}
            width={barW}
            height={base - writeTop}
            fill="var(--viz-node-bg)"
            stroke="var(--viz-node-border)"
            strokeWidth={1}
          />
          {c > 1 && (
            <rect
              x={bx}
              y={yOf(c)}
              width={barW}
              height={writeTop - yOf(c)}
              fill="var(--viz-changed-fill)"
              stroke="var(--viz-changed)"
              strokeWidth={1}
            />
          )}
        </g>,
      );
      const pt = { x: x0 + k * slot + slot / 2, y: yOf(sum / (k + 1)) };
      if (prev) {
        parts.push(
          <line
            key={`avg-${k}`}
            x1={prev.x}
            y1={prev.y}
            x2={pt.x}
            y2={pt.y}
            stroke="var(--viz-current)"
            strokeWidth={2}
          />,
        );
      }
      parts.push(<circle key={`avg-pt-${k}`} cx={pt.x} cy={pt.y} r={2.5} fill="var(--viz-current)" />);
      prev = pt;
    });
    parts.push(
      <text key="chart-key" className="viz-label" x={PAD} y={base + 18}>
        Bars: cost. Line: average.
      </text>,
    );
    y = base + 24;
  }

  const height = y + PAD;
  return (
    <VizSvg width={width} height={height}>
      {!thumb && (
        <>
          <text className="viz-label" x={PAD} y={PAD + 12}>
            {`Size ${s.size} · capacity ${s.buffer.capacity}`}
          </text>
          <text className="viz-label" x={PAD} y={PAD + 30}>
            {policyText(s)}
          </text>
        </>
      )}
      {parts}
    </VizSvg>
  );
}
