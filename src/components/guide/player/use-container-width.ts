"use client";

import { useEffect, useState, type RefObject } from "react";

/** SSR / first-render width; the figure re-lays out once ResizeObserver reports. */
export const SSR_FALLBACK_WIDTH = 640;

export interface ContainerWidth {
  /** Content-box width in CSS px. */
  readonly width: number;
  /**
   * true until the first measurement has been painted, and for two frames after
   * every width change: the player suppresses transitions meanwhile, so a
   * re-layout caused only by the width (including the first one after
   * hydration) never animates.
   */
  readonly relayout: boolean;
}

/** Width of `ref`, tracked with ResizeObserver. */
export function useContainerWidth(
  ref: RefObject<HTMLElement | null>,
  fallback = SSR_FALLBACK_WIDTH,
): ContainerWidth {
  const [state, setState] = useState<ContainerWidth>({ width: fallback, relayout: true });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const settle = () => {
      cancelAnimationFrame(raf);
      // Two frames: the new layout is styled and painted with transitions off first.
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => setState((s) => (s.relayout ? { ...s, relayout: false } : s)));
      });
    };
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w === undefined || w <= 0) return;
      const width = Math.floor(w);
      setState((s) => (s.width === width && !s.relayout ? s : { width, relayout: true }));
      settle();
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [ref]);
  return state;
}
