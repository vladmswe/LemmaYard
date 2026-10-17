import { cn } from "cn";

/**
 * Loader in the ∎ language (DESIGN.md §11.2): a 14px square outline that
 * fills bottom-up in a 1.2 s loop; a static outline under reduced motion.
 * Colour follows `currentColor`. Decorative: pair it with visible or
 * sr-only text ("Running…"), or put `aria-busy` on the busy region.
 */
export function QedLoader({ className }: { className?: string }) {
  return <span aria-hidden data-loader className={cn("qed-loader", className)} />;
}
