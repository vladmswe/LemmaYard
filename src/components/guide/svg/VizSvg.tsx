"use client";

import { createContext, useContext, type ReactNode } from "react";

/** Set by <TracePlayer> around its renderer: how the figure's <svg> is labelled. */
export interface VizFrameContextValue {
  /** id of the visually hidden state description (aria-labelledby). */
  readonly descId: string | null;
  /** true while "Show as table" replaces the figure for assistive tech, or in thumbnails. */
  readonly hidden: boolean;
}

export const VizFrameContext = createContext<VizFrameContextValue | null>(null);

export interface VizSvgProps {
  readonly width: number;
  readonly height: number;
  /** Accessible name when the SVG is used outside a player (static figure). */
  readonly title?: string;
  /** id of an element describing the figure; the player context overrides it. */
  readonly descId?: string;
  readonly className?: string;
  /** Shrink to the container width (default). false = keep the size, e.g. inside a scroller. */
  readonly fit?: boolean;
  readonly children: ReactNode;
}

/** Root of every guide figure: 1 SVG unit = 1 CSS px, tokens from viz-theme.css. */
export function VizSvg({ width, height, title, descId, className, fit = true, children }: VizSvgProps) {
  const ctx = useContext(VizFrameContext);
  const labelledBy = ctx?.descId ?? descId;
  const hidden = ctx?.hidden ?? false;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  return (
    <svg
      className={`viz block${className ? ` ${className}` : ""}`}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={fit ? { maxWidth: "100%", height: "auto" } : undefined}
      {...(hidden
        ? { "aria-hidden": true }
        : labelledBy
          ? { role: "img", "aria-labelledby": labelledBy }
          : { role: "img", "aria-label": title ?? "Figure" })}
    >
      {children}
    </svg>
  );
}
