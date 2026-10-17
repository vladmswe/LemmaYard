"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * `matchMedia(query).matches`, or `null` on the server and during hydration
 * (the viewport is unknown there; render a CSS-only fallback for `null`).
 */
export function useMediaQuery(query: string): boolean | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => null,
  );
}

/** The `md` breakpoint (DESIGN.md §6.4): split panes at >= 768px, tabs below. */
export const DESKTOP_QUERY = "(min-width: 768px)";
