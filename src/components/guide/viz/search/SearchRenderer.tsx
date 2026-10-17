"use client";

import type { RendererProps } from "@/components/guide/player/TracePlayer";
import { ArrayRow } from "@/components/guide/svg/ArrayRow";
import { PointerTag } from "@/components/guide/svg/PointerTag";
import { VizSvg } from "@/components/guide/svg/VizSvg";
import { textWidth } from "@/lib/guide/layout/text";
import type { SearchState } from "@/lib/guide/traces/search/model";

import { balancedRowLayout } from "../array/balanced-row";

const PAD = 12;
const HEADER = 22; // "Target 71 · range [17, 24)" line
const ABOVE = 36; // room for the i / mid tag above a row
const INDEX = 20; // index labels under a row
const BOUNDS = 46; // lo / hi tags under the index labels (binary search)
const GAP = 4;

/** Keeps a pointer label (13 px, centred on x) inside the figure. */
function clampTag(x: number, label: string, width: number): number {
  const half = textWidth(label, 13) / 2 + 2;
  return Math.min(Math.max(x, half), width - half);
}

/** Sorted array with the search pointers: i (linear) or mid above, lo / hi boundaries below (binary). */
export function SearchRenderer({ frame, width, hovered, onHover, mode }: RendererProps<SearchState>) {
  const thumb = mode === "thumb";
  const s = frame.state;
  const n = s.items.length;
  const binary = s.op === "binary";
  const inner = Math.max(40, width - 2 * PAD);
  const longest = Math.max(1, ...s.items.map((it) => String(it.value).length));
  const minCell = Math.max(32, Math.ceil(textWidth("0".repeat(longest), 14) + 8));
  const below = (thumb ? 0 : INDEX) + (binary ? BOUNDS : 0);
  const layout = balancedRowLayout(n, inner, {
    minCell,
    maxCell: Math.max(minCell, thumb ? 36 : 48),
    gap: GAP,
    rowGap: ABOVE + below,
  });
  const header = thumb ? 0 : HEADER;
  const top = PAD + header + ABOVE;
  const height = top + Math.max(layout.height, 1) + below + PAD;
  const cellW = layout.cellW;

  const cellAt = (k: number) => layout.positions[k];
  /** Boundary just before cell k / just after cell k, at the bottom of that cell's row. */
  const before = (k: number) => {
    const p = cellAt(k);
    return p ? { x: PAD + p.x - GAP / 2, y: top + p.y + cellW } : null;
  };
  const after = (k: number) => {
    const p = cellAt(k);
    return p ? { x: PAD + p.x + cellW + GAP / 2, y: top + p.y + cellW } : null;
  };
  /** lo marks the start of [lo, hi), hi its end; each sits next to the cell it borders. */
  const loMark = (k: number) => (k < n ? before(k) : after(n - 1));
  const hiMark = (k: number) => (k > 0 ? after(k - 1) : before(0));

  let title = `Target ${s.target}`;
  if (s.result !== null) title += ` · returns ${s.result}`;
  else if (binary && s.lo !== null && s.hi !== null) title += ` · range [${s.lo}, ${s.hi})`;

  const atPos = s.at !== null ? cellAt(s.at) : undefined;
  const atLabel = binary ? (s.lo !== null && s.lo === s.hi ? "lo" : "mid") : "i";
  const tagY = (thumb ? 0 : INDEX) + 2;

  const lo = binary && s.lo !== null && n > 0 ? loMark(s.lo) : null;
  const hi = binary && s.hi !== null && n > 0 ? hiMark(s.hi) : null;

  return (
    <VizSvg width={width} height={height}>
      {!thumb && (
        <text className="viz-label" x={PAD} y={PAD + 12}>
          {title}
        </text>
      )}
      <ArrayRow
        items={s.items}
        x={PAD}
        y={top}
        cellW={cellW}
        gap={GAP}
        positions={layout.positions}
        roles={frame.roles}
        showIndices={!thumb}
        thumb={thumb}
        hovered={hovered}
        onHover={thumb ? undefined : onHover}
      />
      {atPos && s.result === null && (
        <PointerTag label={atLabel} x={PAD + atPos.x + cellW / 2} y={top + atPos.y - 4} side="above" thumb={thumb} />
      )}
      {lo && hi && s.lo === s.hi && <PointerTag label="lo = hi" x={clampTag(lo.x, "lo = hi", width)} y={lo.y + tagY} side="below" thumb={thumb} />}
      {lo && hi && s.lo !== s.hi && (
        <>
          <PointerTag label="lo" x={clampTag(lo.x, "lo", width)} y={lo.y + tagY} side="below" thumb={thumb} />
          <PointerTag label="hi" x={clampTag(hi.x, "hi", width)} y={hi.y + tagY} side="below" thumb={thumb} />
        </>
      )}
    </VizSvg>
  );
}
