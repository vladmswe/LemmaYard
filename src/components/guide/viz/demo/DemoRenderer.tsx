"use client";

import type { RendererProps } from "@/components/guide/player/TracePlayer";
import { ArrayRow } from "@/components/guide/svg/ArrayRow";
import { PointerTag } from "@/components/guide/svg/PointerTag";
import { TreeEdges, TreeNode } from "@/components/guide/svg/Tree";
import { VizSvg } from "@/components/guide/svg/VizSvg";
import type { ElementId, Role } from "@/lib/guide/contracts";
import { rowLayout } from "@/lib/guide/layout/row";
import { binaryTreeLayout } from "@/lib/guide/layout/tree";
import type { ScanState, TreeState } from "@/lib/guide/traces/demo/linear-scan";

const PAD = 12;
const POINTER_SPACE = 40; // room above a row for the "i" pointer tag
const LABEL_SPACE = 22; // index labels under a row

export function ScanRenderer({ frame, width, hovered, onHover, mode }: RendererProps<ScanState>) {
  const thumb = mode === "thumb";
  const s = frame.state;
  const inner = Math.max(32, width - 2 * PAD);
  const layout = rowLayout(s.items.length, inner, {
    minCell: 32,
    maxCell: thumb ? 36 : 56,
    rowGap: POINTER_SPACE + LABEL_SPACE,
  });
  const top = PAD + (thumb ? 8 : 20) + POINTER_SPACE;
  const height = top + layout.height + LABEL_SPACE + PAD;
  const pointerId = frame.pointers?.i ?? null;
  const k = pointerId === null ? -1 : s.items.findIndex((it) => it.id === pointerId);
  const pos = k >= 0 ? layout.positions[k] : undefined;
  return (
    <VizSvg width={width} height={height}>
      {!thumb && (
        <text className="viz-label" x={PAD} y={PAD + 12}>
          Target {s.target}
        </text>
      )}
      <ArrayRow
        items={s.items}
        x={PAD}
        y={top}
        cellW={layout.cellW}
        positions={layout.positions}
        roles={frame.roles}
        showIndices
        thumb={thumb}
        hovered={hovered}
        onHover={thumb ? undefined : onHover}
      />
      {pos && (
        <PointerTag label="i" x={PAD + pos.x + layout.cellW / 2} y={top + pos.y - 4} side="above" thumb={thumb} />
      )}
    </VizSvg>
  );
}

const R = 18;

export function TreeRenderer({ frame, width, hovered, onHover, mode }: RendererProps<TreeState>) {
  const thumb = mode === "thumb";
  const s = frame.state;
  const byId = new Map(s.nodes.map((n) => [n.id, n]));
  const inner = Math.max(36, width - 2 * PAD);
  const layout = binaryTreeLayout(
    s.root,
    (id) => {
      const n = byId.get(id);
      return [n?.left ?? null, n?.right ?? null];
    },
    inner,
    { levelGap: thumb ? 44 : 64, top: R + 16, minGap: thumb ? 22 : 40 },
  );
  const parentOf: Record<ElementId, ElementId | null> = { [s.root]: null };
  for (const n of s.nodes) {
    if (n.left) parentOf[n.left] = n.id;
    if (n.right) parentOf[n.right] = n.id;
  }
  const edgeRoles: Record<ElementId, Role> = {};
  for (const [child, parent] of Object.entries(parentOf)) {
    if (parent === null) continue;
    const pr = frame.roles[parent];
    const cr = frame.roles[child];
    if (pr && cr && cr !== "muted") edgeRoles[child] = "path";
  }
  const svgWidth = layout.contentWidth + 2 * PAD;
  const height = layout.height + 8;
  const positions = new Map(
    Array.from(layout.positions, ([id, p]) => [id, { x: p.x + PAD, y: p.y }] as const),
  );
  const svg = (
    <VizSvg width={svgWidth} height={height} fit={thumb || !layout.tooWide}>
      <TreeEdges positions={positions} parentOf={parentOf} roles={edgeRoles} r={thumb ? 12 : R} thumb={thumb} />
      {s.nodes.map((n) => {
        const p = positions.get(n.id);
        if (!p) return null;
        return (
          <TreeNode
            key={n.id}
            id={n.id}
            x={p.x}
            y={p.y}
            r={thumb ? 12 : R}
            label={n.key}
            role={frame.roles[n.id]}
            thumb={thumb}
            hovered={hovered === n.id}
            onHover={thumb ? undefined : onHover}
          />
        );
      })}
    </VizSvg>
  );
  if (!layout.tooWide || thumb) return svg;
  // Too wide for the figure: scroll inside it (never the page); focusable so keys can scroll it.
  return (
    <div
      className="overflow-x-auto outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      tabIndex={0}
      role="group"
      aria-label="Tree, scroll sideways to see all nodes"
      data-viz-scroller=""
    >
      {svg}
    </div>
  );
}
