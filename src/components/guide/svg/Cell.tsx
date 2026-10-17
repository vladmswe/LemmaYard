import type { ElementId, Role } from "@/lib/guide/contracts";

import { RoleShape } from "./RoleShape";
import { roleStyle } from "./role-style";

export interface CellProps {
  readonly id: ElementId;
  readonly x: number; // top-left corner
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly value: string | number;
  readonly role?: Role | null;
  /** Small label under the cell (usually the index). */
  readonly sub?: string | number;
  /** Key-steps thumbnail: no ids in the DOM, thumbnail-only badges. */
  readonly thumb?: boolean;
  readonly hovered?: boolean;
  readonly onHover?: (id: ElementId | null) => void;
}

/** One array slot / bucket / bit: a box with a value and an optional index label. */
export function Cell({ id, x, y, w, h, value, role, sub, thumb = false, hovered, onHover }: CellProps) {
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
      <RoleShape shape={{ kind: "rect", w, h }} role={role} thumb={thumb} hovered={hovered} />
      <text
        className="viz-text"
        x={w / 2}
        y={h / 2}
        dy="0.35em"
        textAnchor="middle"
        style={{ fill: st.textFill }}
      >
        {value}
      </text>
      {sub !== undefined && (
        <text className="viz-label" x={w / 2} y={h + 15} textAnchor="middle">
          {sub}
        </text>
      )}
    </g>
  );
}
