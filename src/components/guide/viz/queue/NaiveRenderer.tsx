"use client";

import type { RendererProps } from "@/components/guide/player/TracePlayer";
import { Cell } from "@/components/guide/svg/Cell";
import { RoleShape } from "@/components/guide/svg/RoleShape";
import { VizSvg } from "@/components/guide/svg/VizSvg";
import { NAIVE_ID, QUEUE_MAX_OPS, type NaiveItem, type NaiveState } from "@/lib/guide/traces/queue/types";

import { balancedRowLayout } from "../array/balanced-row";

import { LABEL_SPACE, SlotLabels } from "./slot-labels";

const PAD = 12;
const FRAME = 10;
const HEADER = 40;
const MARKER = 16;
const INDEX = 20;
const GAP = 4;

/**
 * Queue in a plain list: index 0 is the front. Values keep their ids, so
 * after a dequeue they visibly slide one slot left.
 */
export function NaiveRenderer({ frame, width, hovered, onHover, mode }: RendererProps<NaiveState>) {
  const thumb = mode === "thumb";
  const s = frame.state;
  const inner = Math.max(40, width - 2 * PAD - 2 * FRAME);
  const below = thumb ? 4 : INDEX + LABEL_SPACE;
  // Room for the longest possible list, so positions do not jump as it grows.
  const layout = balancedRowLayout(QUEUE_MAX_OPS, inner, { minCell: 32, maxCell: thumb ? 32 : 44, gap: GAP, rowGap: MARKER + below });
  const cells: { item: NaiveItem; at: number }[] = [];
  if (s.removed) cells.push({ item: s.removed, at: 0 });
  s.items.forEach((item, k) => cells.push({ item, at: k + (s.gap ? 1 : 0) }));
  const used = Math.max(1, ...cells.map((c) => c.at + 1));
  const rows = Math.ceil(used / layout.perRow);
  const rowsH = rows * layout.cellW + (rows - 1) * (MARKER + below);
  const header = thumb ? 0 : HEADER;
  const boxTop = PAD + header + 8;
  const top = boxTop + FRAME + MARKER;
  const boxH = MARKER + rowsH + below + 2 * FRAME;
  const left = PAD + FRAME;
  const boxLeft = PAD + Math.max(0, (inner - layout.usedWidth) / 2);
  const role = frame.roles[NAIVE_ID];
  const frontId = frame.pointers?.front ?? null;
  const backId = s.items.at(-1)?.id ?? null;
  const out = s.out === null ? "" : s.out === "error" ? " · failed: empty" : ` · returned ${s.out}`;

  return (
    <VizSvg width={width} height={boxTop + boxH + 18 + PAD}>
      {!thumb && (
        <>
          <text className="viz-label" x={PAD} y={PAD + 12}>
            {/* While the gap is open the next frame asks for the count: show no size. */}
            {s.gap ? "Gap at index 0 · front = index 0" : `Size ${s.items.length} · front = index 0`}
          </text>
          <text className="viz-label" x={PAD} y={PAD + 30}>
            {s.op ? `${s.op}${out}` : s.completed ? "All ops done" : "No op yet"}
          </text>
        </>
      )}
      <g data-id={thumb ? undefined : NAIVE_ID} data-role={role ?? undefined} transform={`translate(${boxLeft}, ${boxTop})`}>
        <RoleShape shape={{ kind: "rect", w: layout.usedWidth + 2 * FRAME, h: boxH, rx: 10 }} role={role} thumb={thumb} />
      </g>
      {cells.map(({ item, at }) => {
        const p = layout.positions[at];
        if (!p) return null;
        const x = left + p.x;
        const y = top + p.y;
        const front = !s.gap && item.id === frontId;
        const back = item.id === backId && !(s.removed && item.id === s.removed.id);
        return (
          <g key={item.id}>
            <Cell
              id={item.id}
              x={x}
              y={y}
              w={layout.cellW}
              h={layout.cellW}
              value={item.value}
              role={frame.roles[item.id]}
              sub={thumb ? undefined : at}
              thumb={thumb}
              hovered={hovered === item.id}
              onHover={thumb ? undefined : onHover}
            />
            {!thumb && (front || back) && (
              <SlotLabels lines={[front ? "front" : null, back ? "back" : null]} x={x + layout.cellW / 2} y={y + layout.cellW + INDEX} />
            )}
          </g>
        );
      })}
    </VizSvg>
  );
}
