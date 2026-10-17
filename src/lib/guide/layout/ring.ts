// Points evenly spaced on a circle (hash rings, circular buffers).

export interface RingPoint {
  readonly x: number;
  readonly y: number;
  /** Degrees, clockwise from the positive x axis (SVG y points down). */
  readonly angle: number;
}

export function ringLayout(
  n: number,
  cx: number,
  cy: number,
  r: number,
  startDeg = -90,
): RingPoint[] {
  const out: RingPoint[] = [];
  for (let i = 0; i < n; i++) {
    const angle = startDeg + (360 * i) / n;
    const rad = (angle * Math.PI) / 180;
    out.push({ x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad), angle });
  }
  return out;
}
