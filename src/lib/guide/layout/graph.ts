// Graph nodes are authored in a 0..100 coordinate box and scaled to the figure.

export interface GraphPoint {
  readonly x: number; // 0..100
  readonly y: number; // 0..100
}

/** Maps 0..100 coordinates into [pad, width - pad] x [pad, height - pad] px. */
export function scaleGraph<N extends GraphPoint>(
  nodes: readonly N[],
  width: number,
  height: number,
  pad: number,
): N[] {
  const w = Math.max(0, width - 2 * pad);
  const h = Math.max(0, height - 2 * pad);
  return nodes.map((n) => ({ ...n, x: pad + (n.x / 100) * w, y: pad + (n.y / 100) * h }));
}
