"use client";

import { useEffect, useRef } from "react";

/**
 * Sets `data-scrolled` on the enclosing header once the page has scrolled
 * more than 8px (the header's hairline border appears then, DESIGN.md §12).
 * Renders an empty, hidden span.
 */
export function HeaderScrollState() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const header = ref.current?.closest("header");
    if (!header) return;
    const update = () => header.toggleAttribute("data-scrolled", window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return <span ref={ref} hidden />;
}
