import type { Role } from "@/lib/guide/contracts";

import { roleStyle } from "./role-style";

export interface ArrowPoint {
  readonly x: number;
  readonly y: number;
}

export interface ArrowProps {
  readonly from: ArrowPoint;
  readonly to: ArrowPoint;
  /** Perpendicular offset of the curve's control point in px (0 = straight). */
  readonly bend?: number;
  readonly dashed?: boolean;
  readonly role?: Role | null;
  readonly label?: string;
  /** Shorten the start / end by this many px (e.g. a node radius). */
  readonly fromInset?: number;
  readonly toInset?: number;
  readonly id?: string;
  readonly thumb?: boolean;
}

/**
 * Pointer or edge with an arrowhead. Heads are drawn inline (no <marker>
 * defs), so several players on one page never share or duplicate DOM ids.
 */
export function Arrow({
  from,
  to,
  bend = 0,
  dashed = false,
  role,
  label,
  fromInset = 0,
  toInset = 0,
  id,
  thumb = false,
}: ArrowProps) {
  const st = roleStyle(role);
  const stroke = role ? st.stroke : "var(--viz-edge)";
  const width = role ? st.strokeWidth : 1.5;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const cx = (from.x + to.x) / 2 + nx * bend;
  const cy = (from.y + to.y) / 2 + ny * bend;
  // Insets along the tangent at each end.
  const t0 = Math.hypot(cx - from.x, cy - from.y) || 1;
  const t1 = Math.hypot(to.x - cx, to.y - cy) || 1;
  const sx = from.x + ((cx - from.x) / t0) * fromInset;
  const sy = from.y + ((cy - from.y) / t0) * fromInset;
  const ux = (to.x - cx) / t1;
  const uy = (to.y - cy) / t1;
  const ex = to.x - ux * toInset;
  const ey = to.y - uy * toInset;
  const head = 8;
  const hx = ex - ux * head;
  const hy = ey - uy * head;
  const d = bend === 0 ? `M${sx},${sy} L${hx},${hy}` : `M${sx},${sy} Q${cx},${cy} ${hx},${hy}`;
  return (
    <g data-id={thumb ? undefined : id} data-role={role ?? undefined} opacity={st.shapeOpacity}>
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeDasharray={dashed ? "5 4" : st.dash}
      />
      <path
        d={`M${ex},${ey} L${hx - uy * 4.5},${hy + ux * 4.5} L${hx + uy * 4.5},${hy - ux * 4.5} Z`}
        fill={stroke}
      />
      {label && (
        <text className="viz-label" x={cx + nx * 10} y={cy + ny * 10} dy="0.35em" textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * Kept for the planned API: arrowheads are inline, so no <defs> are needed.
 * Rendering <ArrowDefs /> is harmless and draws nothing.
 */
export function ArrowDefs() {
  return null;
}
