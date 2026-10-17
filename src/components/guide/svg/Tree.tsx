import type { ElementId, Role } from "@/lib/guide/contracts";

import { RoleShape } from "./RoleShape";
import { roleStyle } from "./role-style";

export interface TreeNodeProps {
  readonly id: ElementId;
  readonly x: number; // centre
  readonly y: number;
  readonly r?: number; // default 18
  readonly label: string | number;
  /** Optional second line, e.g. "key / priority" or an index. */
  readonly sub?: string | number;
  readonly role?: Role | null;
  readonly thumb?: boolean;
  readonly hovered?: boolean;
  readonly onHover?: (id: ElementId | null) => void;
}

/** Circle node with a label (heaps, BSTs, tries). */
export function TreeNode({ id, x, y, r = 18, label, sub, role, thumb = false, hovered, onHover }: TreeNodeProps) {
  const st = roleStyle(role);
  return (
    <g
      className="viz-g"
      data-id={thumb ? undefined : id}
      data-role={role ?? undefined}
      style={{ transform: `translate(${x}px, ${y}px)` }}
      onPointerEnter={onHover ? () => onHover(id) : undefined}
      onPointerLeave={onHover ? () => onHover(null) : undefined}
    >
      <RoleShape shape={{ kind: "circle", r }} role={role} thumb={thumb} hovered={hovered} />
      <text className="viz-text" y={0} dy="0.35em" textAnchor="middle" style={{ fill: st.textFill }}>
        {label}
      </text>
      {sub !== undefined && (
        <text className="viz-label" y={r + 15} textAnchor="middle">
          {sub}
        </text>
      )}
    </g>
  );
}

export interface TreeEdgesProps {
  readonly positions: ReadonlyMap<ElementId, { readonly x: number; readonly y: number }>;
  /** child id -> parent id (null for the root). */
  readonly parentOf: Readonly<Record<ElementId, ElementId | null>>;
  /** Edge roles keyed by the child id (e.g. "path" for the walked edges). */
  readonly roles?: Readonly<Record<ElementId, Role>>;
  readonly r?: number; // node radius, edges stop at the circle; default 18
  readonly thumb?: boolean;
}

/** Straight parent → child edges; drawn before the nodes so nodes sit on top. */
export function TreeEdges({ positions, parentOf, roles = {}, r = 18, thumb = false }: TreeEdgesProps) {
  return (
    <g data-tree-edges="">
      {Object.entries(parentOf).map(([child, parent]) => {
        if (parent === null) return null;
        const a = positions.get(parent);
        const b = positions.get(child);
        if (!a || !b) return null;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        const role = roles[child];
        const st = roleStyle(role);
        const edgeId = `${parent}-${child}`;
        return (
          <line
            key={edgeId}
            data-id={thumb ? undefined : edgeId}
            data-role={role ?? undefined}
            x1={a.x + ux * r}
            y1={a.y + uy * r}
            x2={b.x - ux * r}
            y2={b.y - uy * r}
            stroke={role ? st.stroke : "var(--viz-edge)"}
            strokeWidth={role ? st.strokeWidth : 1.5}
            strokeDasharray={st.dash}
            opacity={st.shapeOpacity}
          />
        );
      })}
    </g>
  );
}
