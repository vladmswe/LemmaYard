/**
 * Named pointer (head, tail, i, j, top, lo, hi) next to the element it points
 * at. (x, y) is the anchor on the element edge: its top centre for "above",
 * its bottom centre for "below".
 */
export function PointerTag({
  label,
  x,
  y,
  side,
  thumb = false,
}: {
  label: string;
  x: number;
  y: number;
  side: "above" | "below";
  thumb?: boolean;
}) {
  const dir = side === "above" ? -1 : 1;
  return (
    <g
      className="viz-g"
      data-pointer={thumb ? undefined : label}
      style={{ transform: `translate(${x}px, ${y}px)` }}
    >
      <line x1={0} y1={dir * 4} x2={0} y2={dir * 14} stroke="var(--viz-current)" strokeWidth={2} />
      <path
        d={side === "above" ? "M-4,-8 L4,-8 L0,-3 Z" : "M-4,8 L4,8 L0,3 Z"}
        fill="var(--viz-current)"
      />
      <text className="viz-pointer" x={0} y={side === "above" ? -20 : 30} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}
