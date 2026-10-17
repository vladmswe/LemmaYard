import { cn } from "cn";

/**
 * Brand mark (DESIGN.md §5): an L-shaped proof margin (stroke 3/24) holding a
 * 7×7 tombstone ∎. Uses `currentColor`; the default class colours it primary.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cn("size-[26px] shrink-0 text-primary", className)}
    >
      <path d="M4.5 2.5v17h17" fill="none" stroke="currentColor" strokeWidth="3" />
      <rect x="9.5" y="8" width="7" height="7" fill="currentColor" />
    </svg>
  );
}

/**
 * Mark + wordmark A: Instrument Sans 600, width 92%, −2.5% tracking. The
 * text follows `currentColor`; pass `markClassName` to recolour the mark
 * (e.g. `text-sky` on the night footer).
 */
export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 font-sans text-xl leading-none font-semibold tracking-[-0.025em] [font-stretch:92%]",
        className,
      )}
    >
      <LogoMark className={markClassName} />
      LemmaYard
    </span>
  );
}
