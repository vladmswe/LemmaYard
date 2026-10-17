import type { ElementId, Role } from "@/lib/guide/contracts";
import { textWidth } from "@/lib/guide/layout/text";

import { RoleShape } from "./RoleShape";
import { roleStyle } from "./role-style";

export interface NodeField {
  readonly name: string; // e.g. "prev", "val", "next"
  readonly value: string | number;
}

export interface NodeBoxGeometry {
  readonly width: number;
  readonly height: number;
  /** x of each field's left edge (separators are drawn there). */
  readonly fieldLefts: readonly number[];
  /** Anchor points relative to the box's top-left corner. */
  readonly anchors: {
    readonly left: { x: number; y: number };
    readonly right: { x: number; y: number };
    readonly top: { x: number; y: number };
    readonly bottom: { x: number; y: number };
    /** Centre of each field, by field name (arrows start from pointer fields). */
    readonly fields: Readonly<Record<string, { x: number; y: number }>>;
  };
}

const FIELD_H = 36;
const FONT = 14;

/** Size and anchor points of a NodeBox, computed without a DOM (for layout and arrows). */
export function nodeBoxGeometry(fields: readonly NodeField[]): NodeBoxGeometry {
  const widths = fields.map((f) => Math.max(32, textWidth(String(f.value), FONT) + 16, textWidth(f.name, 12) + 8));
  const width = widths.reduce((a, b) => a + b, 0);
  const height = FIELD_H + 16; // value row + field-name row
  let x = 0;
  const centres: Record<string, { x: number; y: number }> = {};
  const fieldLefts: number[] = [];
  fields.forEach((f, k) => {
    const w = widths[k] as number;
    fieldLefts.push(x);
    centres[f.name] = { x: x + w / 2, y: FIELD_H / 2 };
    x += w;
  });
  return {
    width,
    height,
    fieldLefts,
    anchors: {
      left: { x: 0, y: FIELD_H / 2 },
      right: { x: width, y: FIELD_H / 2 },
      top: { x: width / 2, y: 0 },
      bottom: { x: width / 2, y: FIELD_H },
      fields: centres,
    },
  };
}

/** Linked-list style node: one compartment per field, field names underneath. */
export function NodeBox({
  id,
  x,
  y,
  fields,
  role,
  thumb = false,
}: {
  id: ElementId;
  x: number;
  y: number;
  fields: readonly NodeField[];
  role?: Role | null;
  thumb?: boolean;
}) {
  const geo = nodeBoxGeometry(fields);
  const st = roleStyle(role);
  return (
    <g
      className="viz-g"
      data-id={thumb ? undefined : id}
      data-role={role ?? undefined}
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      <RoleShape shape={{ kind: "rect", w: geo.width, h: FIELD_H }} role={role} thumb={thumb} />
      {fields.map((f, k) => {
        const c = geo.anchors.fields[f.name] as { x: number; y: number };
        const left = geo.fieldLefts[k] as number;
        return (
          <g key={f.name}>
            {k > 0 && <line x1={left} y1={0} x2={left} y2={FIELD_H} stroke={st.stroke} strokeWidth={1} />}
            <text className="viz-text" x={c.x} y={c.y} dy="0.35em" textAnchor="middle" style={{ fill: st.textFill }}>
              {f.value}
            </text>
            <text className="viz-label" x={c.x} y={FIELD_H + 14} textAnchor="middle">
              {f.name}
            </text>
          </g>
        );
      })}
    </g>
  );
}
