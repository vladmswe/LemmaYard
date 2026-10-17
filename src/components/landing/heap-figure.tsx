/**
 * Monoline min-heap figure for the landing's guide card (DESIGN.md §10):
 * the hot node 2 sifts up past 9 and back, a slow loop (static under reduced
 * motion). Decorative: the card text says what the guide does.
 */
export function HeapFigure() {
  const nodes: [x: number, y: number, v: string, cls?: string][] = [
    [218, 82, "5"],
    [20, 152, "11"],
    [104, 152, "14"],
    [176, 152, "7"],
  ];
  return (
    <svg viewBox="0 0 320 210" aria-hidden className="ly-heap block h-auto w-full overflow-visible">
      <line className="e" x1="160" y1="30" x2="82" y2="100" />
      <line className="e" x1="160" y1="30" x2="238" y2="100" />
      <line className="e" x1="82" y1="100" x2="40" y2="170" />
      <line className="e" x1="82" y1="100" x2="124" y2="170" />
      <line className="e" x1="238" y1="100" x2="196" y2="170" />
      <g className="nd sift-down">
        <rect x="140" y="12" width="40" height="36" rx="8" />
        <text x="160" y="30">
          9
        </text>
      </g>
      {nodes.map(([x, y, v]) => (
        <g key={v} className="nd">
          <rect x={x} y={y} width="40" height="36" rx="8" />
          <text x={x + 20} y={y + 18}>
            {v}
          </text>
        </g>
      ))}
      <g className="nd hot sift-up">
        <rect x="62" y="82" width="40" height="36" rx="8" />
        <text x="82" y="100">
          2
        </text>
      </g>
      <text className="cap" x="0" y="206">
        sift_up(i=1) · parent = (i-1)//2
      </text>
    </svg>
  );
}
