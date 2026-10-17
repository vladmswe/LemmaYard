"use client";

import type { ReactNode } from "react";

import type { RendererProps } from "@/components/guide/player/TracePlayer";
import { Cell } from "@/components/guide/svg/Cell";
import { VizSvg } from "@/components/guide/svg/VizSvg";
import { monoAnswerId, monoEntryId, type MonoState } from "@/lib/guide/traces/stack/model";

import { balancedRowLayout } from "../array/balanced-row";

const PAD = 12;
const HEADER = 22;
const MARKER = 16;
const INDEX = 20;
const CAPTION = 22;

/** Values with their index, the "next greater" answers under them, and the stack of waiting indices. */
export function MonotonicRenderer({ frame, width, hovered, onHover, mode }: RendererProps<MonoState>) {
  const thumb = mode === "thumb";
  const s = frame.state;
  const inner = Math.max(40, width - 2 * PAD - (thumb ? 8 : 0)); // thumbnails: room for the "new" badge
  const left = PAD + (thumb ? 4 : 0);
  const index = thumb ? 4 : INDEX;
  const parts: ReactNode[] = [];
  let y = PAD + (thumb ? 0 : HEADER);
  const n = s.items.length;
  const layout = balancedRowLayout(Math.max(1, n), inner, { minCell: 32, maxCell: 48, gap: 4, rowGap: MARKER + index });

  const caption = (key: string, text: string) => {
    if (thumb) return;
    parts.push(
      <text key={key} className="viz-label" x={PAD} y={y + 13}>
        {text}
      </text>,
    );
    y += CAPTION;
  };

  caption("values-caption", "Values");
  y += MARKER;
  s.items.forEach((it, k) => {
    const p = layout.positions[k];
    if (!p) return;
    parts.push(
      <Cell
        key={it.id}
        id={it.id}
        x={left + p.x}
        y={y + p.y}
        w={layout.cellW}
        h={layout.cellW}
        value={it.value}
        role={frame.roles[it.id]}
        sub={thumb ? undefined : k}
        thumb={thumb}
        hovered={hovered === it.id}
        onHover={thumb ? undefined : onHover}
      />,
    );
  });
  y += (n ? layout.height : 0) + index + 18;

  caption("answers-caption", "Next greater");
  y += MARKER;
  s.answers.forEach((x, k) => {
    const p = layout.positions[k];
    if (!p) return;
    const id = monoAnswerId(k);
    parts.push(
      <Cell
        key={id}
        id={id}
        x={left + p.x}
        y={y + p.y}
        w={layout.cellW}
        h={layout.cellW}
        value={x === null ? "?" : x}
        role={frame.roles[id] ?? (x === null ? "muted" : undefined)}
        sub={thumb ? undefined : k}
        thumb={thumb}
        hovered={hovered === id}
        onHover={thumb ? undefined : onHover}
      />,
    );
  });
  y += (n ? layout.height : 0) + index + 18;

  caption("stack-caption", s.stack.length || s.popped.length ? "Stack of indices, bottom → top" : "Stack of indices: empty");
  const entries = [...s.stack, ...s.popped];
  const row = balancedRowLayout(Math.max(1, entries.length), inner, { minCell: 32, maxCell: 48, gap: 4, rowGap: MARKER + index });
  y += MARKER;
  entries.forEach((j, k) => {
    const p = row.positions[k];
    if (!p) return;
    const id = monoEntryId(j);
    parts.push(
      <Cell
        key={id}
        id={id}
        x={left + p.x}
        y={y + p.y}
        w={row.cellW}
        h={row.cellW}
        value={s.items[j]?.value ?? ""}
        role={frame.roles[id]}
        sub={thumb ? undefined : `i${j}`}
        thumb={thumb}
        hovered={hovered === id}
        onHover={thumb ? undefined : onHover}
      />,
    );
  });
  y += row.cellW + (entries.length ? row.height - row.cellW : 0) + index + 18;

  return (
    <VizSvg width={width} height={y + PAD}>
      {!thumb && (
        <text className="viz-label" x={PAD} y={PAD + 12}>
          {`Pushes ${s.pushes} · pops ${s.pops}${s.i === null ? "" : ` · at index ${s.i}`}`}
        </text>
      )}
      {parts}
    </VizSvg>
  );
}
