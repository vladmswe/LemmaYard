import type { CSSProperties } from "react";

/** Motion tokens (DESIGN.md §6.6), for code that needs them in JS. */
export const MOTION = {
  durationFast: 120,
  durationBase: 180,
  durationSlow: 260,
  staggerStep: 60,
  /** Stagger stops growing after this many items so long lists don't lag. */
  maxStaggerIndex: 8,
  easeOut: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  easeIn: "cubic-bezier(0.4, 0, 1, 1)",
} as const;

/**
 * Inline style for a `.reveal` element at position `index` of a staggered
 * group. The index is clamped to 0..maxStaggerIndex.
 */
export function revealStyle(index = 0, delayMs?: number): CSSProperties {
  const i = Number.isFinite(index)
    ? Math.min(Math.max(Math.trunc(index), 0), MOTION.maxStaggerIndex)
    : 0;
  const style: Record<string, string> = { "--reveal-index": String(i) };
  if (delayMs !== undefined && Number.isFinite(delayMs) && delayMs > 0) {
    style["--reveal-delay"] = `${Math.round(delayMs)}ms`;
  }
  return style as CSSProperties;
}
