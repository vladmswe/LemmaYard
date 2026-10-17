import type { Role } from "@/lib/guide/contracts";

import { Badge } from "./Badge";
import { roleStyle, THUMB_ONLY_CUES, type RoleStyle } from "./role-style";

export type ShapeKind = { kind: "rect"; w: number; h: number; rx?: number } | { kind: "circle"; r: number };

function bounds(shape: ShapeKind) {
  return shape.kind === "rect"
    ? { left: 0, top: 0, right: shape.w, bottom: shape.h, cx: shape.w / 2 }
    : { left: -shape.r, top: -shape.r, right: shape.r, bottom: shape.r, cx: 0 };
}

function zigzag(x0: number, x1: number, y: number): string {
  const step = 4;
  let d = `M${x0},${y}`;
  let up = true;
  for (let x = x0 + step; x <= x1; x += step) {
    d += ` L${x},${y + (up ? -3 : 0)}`;
    up = !up;
  }
  return d;
}

/**
 * The outline of a node or cell in its role style, plus the role's non-colour
 * cues. Drawn in local coordinates (rect from 0,0; circle around 0,0).
 */
export function RoleShape({
  shape,
  role,
  thumb = false,
  hovered = false,
}: {
  shape: ShapeKind;
  role?: Role | null;
  thumb?: boolean;
  hovered?: boolean;
}) {
  const st: RoleStyle = roleStyle(role);
  const b = bounds(shape);
  const common = {
    fill: st.fill,
    stroke: st.stroke,
    strokeWidth: st.strokeWidth,
    strokeDasharray: st.dash,
    opacity: st.shapeOpacity,
    "data-shape": "",
  };
  const cues = st.cues.filter((c) => thumb || !THUMB_ONLY_CUES.has(c));
  return (
    <>
      {shape.kind === "rect" ? (
        <rect x={0} y={0} width={shape.w} height={shape.h} rx={shape.rx ?? 6} {...common} />
      ) : (
        <circle cx={0} cy={0} r={shape.r} {...common} />
      )}
      {hovered && (
        <rect
          data-hover=""
          x={b.left - 4}
          y={b.top - 4}
          width={b.right - b.left + 8}
          height={b.bottom - b.top + 8}
          rx={8}
          fill="none"
          stroke="var(--viz-current)"
          strokeWidth={1}
          strokeDasharray="1 2"
        />
      )}
      {cues.map((cue) => {
        switch (cue) {
          case "marker":
            return (
              <path
                key={cue}
                data-cue="marker"
                d={`M${b.cx - 6},${b.top - 12} L${b.cx + 6},${b.top - 12} L${b.cx},${b.top - 4} Z`}
                fill={st.stroke}
              />
            );
          case "double":
            return shape.kind === "rect" ? (
              <rect
                key={cue}
                data-cue="double"
                x={4}
                y={4}
                width={Math.max(0, shape.w - 8)}
                height={Math.max(0, shape.h - 8)}
                rx={Math.max(0, (shape.rx ?? 6) - 3)}
                fill="none"
                stroke={st.stroke}
                strokeWidth={1}
              />
            ) : (
              <circle key={cue} data-cue="double" r={Math.max(0, shape.r - 4)} fill="none" stroke={st.stroke} strokeWidth={1} />
            );
          case "strike":
            return (
              <line
                key={cue}
                data-cue="strike"
                x1={b.left + 2}
                y1={b.bottom - 2}
                x2={b.right - 2}
                y2={b.top + 2}
                stroke={st.stroke}
                strokeWidth={2}
              />
            );
          case "check":
            return <Badge key={cue} x={b.right} y={b.top} kind="check" stroke={st.stroke} />;
          case "bang":
            return (
              <g key={cue}>
                <Badge x={b.right} y={b.top} kind="bang" stroke={st.stroke} />
                <path data-cue="zigzag" d={zigzag(b.left, b.right, b.bottom + 6)} fill="none" stroke={st.stroke} strokeWidth={1.5} />
              </g>
            );
          case "new":
            return <Badge key={cue} x={b.right} y={b.top} kind="text" label="new" stroke={st.stroke} />;
        }
      })}
    </>
  );
}
