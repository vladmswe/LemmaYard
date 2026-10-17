// Approximate text metrics for SVG box sizing without a DOM (0.6 em per character).

export function textWidth(label: string, fontPx: number): number {
  return Array.from(label).length * 0.6 * fontPx;
}
