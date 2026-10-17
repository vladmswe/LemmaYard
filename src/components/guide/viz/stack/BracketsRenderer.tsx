"use client";

import type { ReactNode } from "react";

import type { RendererProps } from "@/components/guide/player/TracePlayer";
import { Cell } from "@/components/guide/svg/Cell";
import { VizSvg } from "@/components/guide/svg/VizSvg";
import type { BracketsState, OpenBracket } from "@/lib/guide/traces/stack/model";

import { balancedRowLayout } from "../array/balanced-row";

const PAD = 12;
const HEADER = 22;
const MARKER = 16; // room above a row for the "current" marker
const INDEX = 20; // index labels under a row
const CAPTION = 22;

/** Spaces are drawn as a middle dot so they stay visible. */
const shown = (ch: string) => (ch === " " ? "·" : ch);

/** The text as a row of character cells, and below it the stack of open brackets (bottom on the left). */
export function BracketsRenderer({ frame, width, hovered, onHover, mode }: RendererProps<BracketsState>) {
  const thumb = mode === "thumb";
  const s = frame.state;
  const inner = Math.max(40, width - 2 * PAD - (thumb ? 8 : 0)); // thumbnails: room for the "new" badge
  const left = PAD + (thumb ? 4 : 0);
  const index = thumb ? 4 : INDEX;
  const parts: ReactNode[] = [];
  let y = PAD + (thumb ? 0 : HEADER);

  // The text.
  const text = balancedRowLayout(Math.max(1, s.chars.length), inner, { minCell: 24, maxCell: 32, gap: 3, rowGap: MARKER + index });
  y += MARKER;
  s.chars.forEach((c, k) => {
    const p = text.positions[k];
    if (!p) return;
    const role = frame.roles[c.id] ?? (k < s.pos && !(s.at && k >= s.at[0] && k < s.at[1]) ? "muted" : undefined);
    parts.push(
      <Cell
        key={c.id}
        id={c.id}
        x={left + p.x}
        y={y + p.y}
        w={text.cellW}
        h={text.cellW}
        value={shown(c.ch)}
        role={role}
        sub={thumb ? undefined : k}
        thumb={thumb}
        hovered={hovered === c.id}
        onHover={thumb ? undefined : onHover}
      />,
    );
  });
  y += (s.chars.length ? text.height : 0) + index + 18; // 18: the error cue

  // The stack.
  if (!thumb) {
    parts.push(
      <text key="stack-caption" className="viz-label" x={PAD} y={y + 13}>
        {s.stack.length ? "Stack of open brackets, bottom → top" : "Stack of open brackets: empty"}
      </text>,
    );
    y += CAPTION;
  }
  const entries: OpenBracket[] = s.popped ? [...s.stack, s.popped] : [...s.stack];
  const row = balancedRowLayout(Math.max(1, entries.length), inner, { minCell: 32, maxCell: 40, gap: 4, rowGap: MARKER + index });
  y += MARKER;
  entries.forEach((e, k) => {
    const p = row.positions[k];
    if (!p) return;
    parts.push(
      <Cell
        key={e.id}
        id={e.id}
        x={left + p.x}
        y={y + p.y}
        w={row.cellW}
        h={row.cellW}
        value={e.ch}
        role={frame.roles[e.id]}
        sub={thumb ? undefined : `@${e.index}`}
        thumb={thumb}
        hovered={hovered === e.id}
        onHover={thumb ? undefined : onHover}
      />,
    );
  });
  y += (entries.length ? row.height : row.cellW) + index + 18;

  const verdict = s.verdict === null ? "" : s.verdict === "balanced" ? " · balanced" : " · unbalanced";
  return (
    <VizSvg width={width} height={y + PAD}>
      {!thumb && (
        <text className="viz-label" x={PAD} y={PAD + 12}>
          {`Read ${s.pos}/${s.chars.length} · stack ${s.stack.length}${verdict}`}
        </text>
      )}
      {parts}
    </VizSvg>
  );
}
