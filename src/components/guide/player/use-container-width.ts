"use client";

import { useEffect, useState, type RefObject } from "react";

/** SSR / first-render width; the figure re-lays out once ResizeObserver reports. */
export const SSR_FALLBACK_WIDTH = 640;

/** Content-box width of `ref` in CSS px, tracked with ResizeObserver. */
export function useContainerWidth(
  ref: RefObject<HTMLElement | null>,
  fallback = SSR_FALLBACK_WIDTH,
): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w !== undefined && w > 0) setWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}
