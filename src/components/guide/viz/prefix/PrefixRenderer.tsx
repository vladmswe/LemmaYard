"use client";

import type { RendererProps } from "@/components/guide/player/TracePlayer";
import { Cell } from "@/components/guide/svg/Cell";
import { VizSvg } from "@/components/guide/svg/VizSvg";
import { rowLayout } from "@/lib/guide/layout/row";
import { textWidth } from "@/lib/guide/layout/text";
import type { PrefixState } from "@/lib/guide/traces/prefix/model";

const PAD = 12;
const HEADER = 22;
const LABEL_W = 18; // "a" / "p" row names
const GAP = 4;
const BLOCK_GAP = 14;

/**
 * Two rows in columns: column j holds a[j - 1] above p[j], so p is one cell
 * longer than a and starts one column earlier (p[0] = 0 has no a above it).
 * Columns wrap into several blocks at narrow widths.
 */
export function PrefixRenderer({ frame, width, hovered, onHover, mode }: RendererProps<PrefixState>) {
  const thumb = mode === "thumb";
  const s = frame.state;
  const n = s.a.length;
  const cols = n + 1;
  // Widest number the figure will ever show (all prefix sums), so cells keep their size while p fills.
  let run = 0;
  let longest = 1;
  for (const c of s.a) {
    run += c.value;
    longest = Math.max(longest, String(c.value).length, String(run).length);
  }
  const minCell = Math.max(32, Math.ceil(textWidth("0".repeat(longest), 14) + 8));
  const labelW = thumb ? 0 : LABEL_W;
  const inner = Math.max(40, width - 2 * PAD - labelW);
  const layout = rowLayout(cols, inner, { minCell, maxCell: Math.max(minCell, thumb ? 40 : 52), gap: GAP });
  const cellW = layout.cellW;
  const idxH = thumb ? 4 : 16;
  const aY = idxH;
  const pY = aY + cellW + 12;
  const blockH = pY + cellW + (thumb ? 4 : 20);
  const header = thumb ? 0 : HEADER;
  const top = PAD + header + 4;
  const height = top + layout.rows * blockH + Math.max(0, layout.rows - 1) * BLOCK_GAP + PAD;
  const left = PAD + labelW;

  let title = `Query [${s.l}, ${s.r})`;
  if (s.result !== null) title = `Sum of [${s.l}, ${s.r}) = ${s.result}`;

  const blockTop = (row: number) => top + row * (blockH + BLOCK_GAP);

  return (
    <VizSvg width={width} height={height}>
      {!thumb && (
        <text className="viz-label" x={PAD} y={PAD + 12}>
          {title}
        </text>
      )}
      {!thumb &&
        Array.from({ length: layout.rows }, (_, row) => (
          <g key={`names-${row}`}>
            <text className="viz-label" x={PAD} y={blockTop(row) + aY + cellW / 2} dy="0.35em">
              a
            </text>
            <text className="viz-label" x={PAD} y={blockTop(row) + pY + cellW / 2} dy="0.35em">
              p
            </text>
          </g>
        ))}
      {layout.positions.map((pos, j) => {
        const x = left + pos.x;
        const bt = blockTop(pos.row);
        const a = j >= 1 ? s.a[j - 1] : undefined;
        const p = s.p[j] ?? null;
        return (
          <g key={`col-${j}`}>
            {a && (
              <>
                {!thumb && (
                  <text className="viz-label" x={x + cellW / 2} y={bt + 11} textAnchor="middle">
                    {j - 1}
                  </text>
                )}
                <Cell
                  id={a.id}
                  x={x}
                  y={bt + aY}
                  w={cellW}
                  h={cellW}
                  value={a.value}
                  role={frame.roles[a.id]}
                  thumb={thumb}
                  hovered={hovered === a.id}
                  onHover={thumb ? undefined : onHover}
                />
              </>
            )}
            {p ? (
              <Cell
                id={p.id}
                x={x}
                y={bt + pY}
                w={cellW}
                h={cellW}
                value={p.value}
                role={frame.roles[p.id]}
                sub={thumb ? undefined : j}
                thumb={thumb}
                hovered={hovered === p.id}
                onHover={thumb ? undefined : onHover}
              />
            ) : (
              <g data-empty-slot="" transform={`translate(${x}, ${bt + pY})`}>
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
                    {j}
                  </text>
                )}
              </g>
            )}
          </g>
        );
      })}
    </VizSvg>
  );
}
