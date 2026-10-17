import type { ElementId, Role } from "@/lib/guide/contracts";
import { scaleGraph } from "@/lib/guide/layout/graph";

import { Arrow } from "./Arrow";
import { roleStyle } from "./role-style";
import { TreeNode } from "./Tree";

export interface GraphNode {
  readonly id: ElementId;
  readonly x: number; // 0..100
  readonly y: number; // 0..100
  readonly label: string;
}

export interface GraphEdge {
  readonly id: ElementId;
  readonly from: ElementId;
  readonly to: ElementId;
  readonly directed: boolean;
  readonly weight?: number;
}

/** Nodes in authored 0..100 coordinates, scaled to width x height; edges under nodes. */
export function GraphView({
  nodes,
  edges,
  roles = {},
  width,
  height,
  r = 18,
  thumb = false,
}: {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  roles?: Readonly<Record<ElementId, Role>>;
  width: number;
  height: number;
  r?: number;
  thumb?: boolean;
}) {
  const placed = scaleGraph(nodes, width, height, r + 6);
  const at = new Map(placed.map((n) => [n.id, n]));
  return (
    <g data-graph="">
      {edges.map((e) => {
        const a = at.get(e.from);
        const b = at.get(e.to);
        if (!a || !b) return null;
        const role = roles[e.id];
        if (e.directed) {
          return (
            <Arrow
              key={e.id}
              id={e.id}
              from={a}
              to={b}
              role={role}
              fromInset={r}
              toInset={r}
              label={e.weight === undefined ? undefined : String(e.weight)}
              thumb={thumb}
            />
          );
        }
        const st = roleStyle(role);
        return (
          <g key={e.id} data-id={thumb ? undefined : e.id} data-role={role ?? undefined}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={role ? st.stroke : "var(--viz-edge)"}
              strokeWidth={role ? st.strokeWidth : 1.5}
              strokeDasharray={st.dash}
              opacity={st.shapeOpacity}
            />
            {e.weight !== undefined && (
              <text className="viz-label" x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle">
                {e.weight}
              </text>
            )}
          </g>
        );
      })}
      {placed.map((n) => (
        <TreeNode key={n.id} id={n.id} x={n.x} y={n.y} r={r} label={n.label} role={roles[n.id]} thumb={thumb} />
      ))}
    </g>
  );
}
