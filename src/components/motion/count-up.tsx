"use client";

import { useEffect, useRef } from "react";

import { countUpValue, MOTION } from "@/lib/motion";

type CountUpProps = {
  /** Final value. Server markup and the no-JS / reduced-motion state show it. */
  value: number;
  decimals?: number;
  durationMs?: number;
  className?: string;
};

/**
 * A number that counts up from 0 over 900 ms (easeOutCubic) the first time
 * it scrolls into view (DESIGN.md §11.2). SSR renders the final value, so
 * crawlers, no-JS visitors and reduced motion always see the real number;
 * the animation writes textContent directly (no re-renders). Use
 * `tabular-nums` on a parent so the width does not jump.
 */
export function CountUp({
  value,
  decimals = 0,
  durationMs = MOTION.durationCount as number,
  className,
}: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const final = value.toFixed(decimals);

  useEffect(() => {
    const el = ref.current;
    if (!el || value === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        let start: number | null = null;
        const step = (ts: number) => {
          start ??= ts;
          const v = countUpValue(value, ts - start, durationMs, decimals);
          el.textContent = v.toFixed(decimals);
          if (ts - start < durationMs) raf = requestAnimationFrame(step);
        };
        el.textContent = (0).toFixed(decimals);
        raf = requestAnimationFrame(step);
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      el.textContent = value.toFixed(decimals);
    };
  }, [value, decimals, durationMs]);

  return (
    <span ref={ref} className={className}>
      {final}
    </span>
  );
}
