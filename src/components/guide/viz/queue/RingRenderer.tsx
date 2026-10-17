"use client";

import type { ReactNode } from "react";

import type { RendererProps } from "@/components/guide/player/TracePlayer";
import { Cell } from "@/components/guide/svg/Cell";
import { RoleShape } from "@/components/guide/svg/RoleShape";
import { VizSvg } from "@/components/guide/svg/VizSvg";
import type { ElementId, Role } from "@/lib/guide/contracts";
import { ringLayout } from "@/lib/guide/layout/ring";
import type { RingBuffer, RingSlot, RingState } from "@/lib/guide/traces/queue/types";

import { balancedRowLayout } from "../array/balanced-row";

import { LABEL_SPACE, SlotLabels } from "./slot-labels";

const PAD = 12;
const HEADER = 40;
const MARKER = 16;
const INDEX = 20;
const CAPTION = 22;
const TAG_GAP = 8; // ring cell edge to its pointer name
const TAG_W = 34; // "head" / "tail" in the pointer font, plus a little air

interface RingGeometry {
  readonly cell: number;
  readonly r: number;
  readonly half: number; // half of the width the ring needs
}

/** Largest cell (36 down to 20) whose ring, with names outside, fits in `inner`. */
export function ringGeometry(cap: number, inner: number, tags: boolean): RingGeometry {
  const s = Math.sin(Math.PI / cap);
  let best: RingGeometry | null = null;
  for (let cell = 36; cell >= 20; cell--) {
    const r = Math.max(cap <= 8 ? 64 : 0, (cell + 8) / (2 * s));
    const half = r + cell / 2 + (tags ? TAG_GAP + TAG_W : 4);
    best = { cell, r, half };
    if (2 * half <= inner) return best;
  }
  return best as RingGeometry;
}

function slotRole(frame: RendererProps<RingState>["frame"], slot: RingSlot): Role | undefined {
  return frame.roles[slot.id];
}

/** One slot: a cell with its value, or a dashed empty box (both carry the slot id). */
function Slot({
  slot,
  x,
  y,
  w,
  role,
  sub,
  thumb,
  hovered,
  onHover,
}: {
  slot: RingSlot;
  x: number;
  y: number;
  w: number;
  role: Role | undefined;
  sub?: number;
  thumb: boolean;
  hovered: ElementId | null;
  onHover?: (id: ElementId | null) => void;
}) {
  if (slot.value !== null) {
    return (
      <Cell
        id={slot.id}
        x={x}
        y={y}
        w={w}
        h={w}
        value={slot.value}
        role={role}
        sub={thumb ? undefined : sub}
        thumb={thumb}
        hovered={hovered === slot.id}
        onHover={thumb ? undefined : onHover}
      />
    );
  }
  return (
    <g
      className="viz-g"
      data-id={thumb ? undefined : slot.id}
      data-role={role ?? undefined}
      data-empty-slot=""
      style={{ transform: `translate(${x}px, ${y}px)` }}
      onPointerEnter={onHover && !thumb ? () => onHover(slot.id) : undefined}
      onPointerLeave={onHover && !thumb ? () => onHover(null) : undefined}
    >
      {role ? (
        <RoleShape shape={{ kind: "rect", w, h: w }} role={role} thumb={thumb} hovered={hovered === slot.id} />
      ) : (
        <rect width={w} height={w} rx={6} fill="none" stroke="var(--viz-node-border)" strokeWidth={1.5} strokeDasharray="4 4" />
      )}
      {!thumb && sub !== undefined && (
        <text className="viz-label" x={w / 2} y={w + 15} textAnchor="middle">
          {sub}
        </text>
      )}
    </g>
  );
}

/**
 * Circular buffer (queue.ring, deque.ring) drawn twice with the same ids: as a
 * ring with "head" / "tail" outside it, and as a straight row of slots. While
 * a grow copies, the new buffer appears as a second row.
 */
export function RingRenderer({ frame, width, hovered, onHover, mode }: RendererProps<RingState>) {
  const thumb = mode === "thumb";
  const s = frame.state;
  const buf = s.buffer;
  const cap = buf.capacity;
  const inner = Math.max(40, width - 2 * PAD);
  const parts: ReactNode[] = [];
  const indexOf = (id: ElementId | null | undefined) => (id ? buf.slots.findIndex((x) => x.id === id) : -1);
  const headAt = indexOf(frame.pointers?.head);
  const tailAt = indexOf(frame.pointers?.tail);
  let y = PAD + (thumb ? 0 : HEADER);

  // Ring view.
  const g = ringGeometry(cap, inner, !thumb);
  const svgW = Math.max(width, 2 * g.half + 2 * PAD);
  const cx = svgW / 2;
  const cy = y + g.half + (thumb ? 0 : 6);
  const pts = ringLayout(cap, cx, cy, g.r);
  const bufRole = frame.roles[buf.id];
  parts.push(
    <g key="ring-track" data-id={thumb ? undefined : buf.id} data-role={bufRole ?? undefined} transform={`translate(${cx}, ${cy})`}>
      <RoleShape shape={{ kind: "circle", r: g.r + g.cell / 2 + 4 }} role={bufRole} thumb={thumb} />
    </g>,
  );
  buf.slots.forEach((slot, k) => {
    const p = pts[k];
    if (!p) return;
    parts.push(
      <Slot
        key={`ring-${slot.id}`}
        slot={slot}
        x={p.x - g.cell / 2}
        y={p.y - g.cell / 2}
        w={g.cell}
        role={slotRole(frame, slot)}
        thumb={thumb}
        hovered={hovered}
        onHover={onHover}
      />,
    );
    if (thumb) return;
    const rad = (p.angle * Math.PI) / 180;
    const ir = g.r - g.cell / 2 - 10;
    parts.push(
      <text key={`ring-idx-${k}`} className="viz-label" x={cx + ir * Math.cos(rad)} y={cy + ir * Math.sin(rad)} dy="0.35em" textAnchor="middle">
        {k}
      </text>,
    );
    const names = [k === headAt ? "head" : null, k === tailAt ? "tail" : null].filter((x): x is string => x !== null);
    if (names.length === 0) return;
    const tr = g.r + g.cell / 2 + TAG_GAP;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const anchor = cos > 0.35 ? "start" : cos < -0.35 ? "end" : "middle";
    const lineH = 15;
    // Names stack away from the ring: downwards below it, upwards above it.
    const baseY = cy + tr * sin + (sin > 0.35 ? 11 : sin < -0.35 ? -(names.length - 1) * lineH - 2 : 4 - ((names.length - 1) * lineH) / 2);
    names.forEach((name, j) => {
      parts.push(
        <text key={`ring-tag-${name}`} className="viz-pointer" data-pointer={name} x={cx + tr * cos} y={baseY + j * lineH} textAnchor={anchor}>
          {name}
        </text>,
      );
    });
  });
  y = cy + g.half + (thumb ? 4 : 10);

  // Row view (same ids) and the new buffer during a grow.
  const drawRow = (b: RingBuffer, caption: string, labels: boolean) => {
    const below = thumb ? 4 : INDEX + (labels ? LABEL_SPACE : 0);
    const layout = balancedRowLayout(b.capacity, inner, { minCell: 28, maxCell: thumb ? 28 : 40, gap: 4, rowGap: MARKER + below });
    if (!thumb) {
      parts.push(
        <text key={`cap-${b.id}`} className="viz-label" x={PAD} y={y + 13}>
          {caption}
        </text>,
      );
      y += CAPTION;
    }
    const role = frame.roles[b.id];
    const top = y + MARKER;
    if (b !== buf) {
      const boxLeft = PAD + Math.max(0, (inner - layout.usedWidth) / 2) - 6;
      parts.push(
        <g key={`box-${b.id}`} data-id={thumb ? undefined : b.id} data-role={role ?? undefined} transform={`translate(${boxLeft}, ${top - 6})`}>
          <RoleShape shape={{ kind: "rect", w: layout.usedWidth + 12, h: layout.height + below + 12, rx: 10 }} role={role} thumb={thumb} />
        </g>,
      );
    }
    b.slots.forEach((slot, k) => {
      const p = layout.positions[k];
      if (!p) return;
      const x = PAD + p.x;
      const sy = top + p.y;
      parts.push(
        <Slot
          key={`row-${slot.id}`}
          slot={slot}
          x={x}
          y={sy}
          w={layout.cellW}
          role={slotRole(frame, slot)}
          sub={k}
          thumb={thumb}
          hovered={hovered}
          onHover={onHover}
        />,
      );
      if (labels && !thumb && (k === headAt || k === tailAt)) {
        parts.push(
          <SlotLabels
            key={`row-tag-${k}`}
            lines={[k === headAt ? "head" : null, k === tailAt ? "tail" : null]}
            x={x + layout.cellW / 2}
            y={sy + layout.cellW + INDEX}
          />,
        );
      }
    });
    y = top + layout.height + below + (b !== buf ? 12 : 0) + 18;
  };
  drawRow(buf, `The same ${cap} slots in a row`, true);
  if (s.next) drawRow(s.next, `New buffer, ${s.next.capacity} slots`, false);

  const tail = (s.head + s.size) % cap;
  const out = s.out === null ? "" : s.out === "error" ? " · failed: empty" : ` · returned ${s.out}`;
  return (
    <VizSvg width={svgW} height={y + PAD}>
      {!thumb && (
        <>
          <text className="viz-label" x={PAD} y={PAD + 12}>
            {`head ${s.head} · size ${s.size}/${cap}${tailAt >= 0 ? ` · tail ${tail}` : ""}`}
          </text>
          <text className="viz-label" x={PAD} y={PAD + 30}>
            {s.op ? `${s.op}${out}` : s.completed ? "All ops done" : "No op yet"}
          </text>
        </>
      )}
      {parts}
    </VizSvg>
  );
}
