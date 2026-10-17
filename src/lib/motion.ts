import type { CSSProperties } from "react";

/** Motion tokens (DESIGN.md §11.1), for code that needs them in JS. */
export const MOTION = {
  /** --d-1: colour and press feedback. */
  durationFast: 120,
  /** --d-2: hover lift, tabs, chips. */
  durationBase: 200,
  /** --d-3: popovers, small springs, mount reveals. */
  durationSlow: 320,
  /** --d-4: scroll reveals, sheets, toasts in. */
  durationReveal: 560,
  /** --d-5: meters and count-ups. */
  durationCount: 900,
  staggerStep: 70,
  /** Stagger stops growing after this many items so long lists don't lag. */
  maxStaggerIndex: 8,
  easeOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  easeIn: "cubic-bezier(0.4, 0, 1, 1)",
  easeInOut: "cubic-bezier(0.65, 0, 0.35, 1)",
  easeSnap: "cubic-bezier(0.34, 1.56, 0.64, 1)",
} as const;

/** Clamps a stagger index to 0..maxStaggerIndex (non-finite → 0). */
export function staggerIndex(index = 0): number {
  return Number.isFinite(index)
    ? Math.min(Math.max(Math.trunc(index), 0), MOTION.maxStaggerIndex)
    : 0;
}

/**
 * Inline style for a `.reveal` / `.rv` element at position `index` of a
 * staggered group (70 ms per step). The index is clamped to 0..8.
 */
export function revealStyle(index = 0, delayMs?: number): CSSProperties {
  const style: Record<string, string> = { "--reveal-index": String(staggerIndex(index)) };
  if (delayMs !== undefined && Number.isFinite(delayMs) && delayMs > 0) {
    style["--reveal-delay"] = `${Math.round(delayMs)}ms`;
  }
  return style as CSSProperties;
}

/** easeOutCubic, used by count-ups. */
export function easeOutCubic(t: number): number {
  const x = Math.min(Math.max(t, 0), 1);
  return 1 - (1 - x) ** 3;
}

/**
 * The value a count-up shows at `elapsedMs` of `durationMs`, rounded to
 * `decimals`. Reaches exactly `to` at the end.
 */
export function countUpValue(
  to: number,
  elapsedMs: number,
  durationMs: number = MOTION.durationCount,
  decimals = 0,
): number {
  if (durationMs <= 0 || elapsedMs >= durationMs) return to;
  const f = 10 ** decimals;
  return Math.round(to * easeOutCubic(elapsedMs / durationMs) * f) / f;
}
