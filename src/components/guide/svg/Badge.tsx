/** Small round or pill badge anchored at a corner (x, y = badge centre). */
export function Badge({
  x,
  y,
  kind,
  label,
  stroke = "var(--viz-current)",
}: {
  x: number;
  y: number;
  kind: "check" | "bang" | "text";
  label?: string;
  stroke?: string;
}) {
  if (kind === "text") {
    const text = label ?? "";
    const w = Math.max(18, text.length * 7 + 8);
    return (
      <g data-cue={`badge-${text}`} transform={`translate(${x - w / 2}, ${y - 8})`}>
        <rect width={w} height={16} rx={8} fill="var(--viz-node-bg)" stroke={stroke} strokeWidth={1.5} />
        <text x={w / 2} y={12} textAnchor="middle" className="viz-label" style={{ fill: "var(--viz-node-fg)" }}>
          {text}
        </text>
      </g>
    );
  }
  return (
    <g data-cue={kind === "check" ? "check" : "bang"} transform={`translate(${x}, ${y})`}>
      <circle r={8} fill="var(--viz-node-bg)" stroke={stroke} strokeWidth={1.5} />
      {kind === "check" ? (
        <path d="M-4,0 L-1,3 L4,-3" fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
      ) : (
        <path d="M0,-4 L0,1 M0,3.5 L0,4" fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" />
      )}
    </g>
  );
}
