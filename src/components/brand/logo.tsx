import { cn } from "cn";

/** Brand mark: lapis rounded square, white `< >`, old-gold dot (DESIGN.md §7). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" aria-hidden className={cn("size-7 shrink-0", className)}>
      <rect width="28" height="28" rx="6" fill="var(--color-blue-600)" />
      <path
        d="M11 8.5 6.5 14l4.5 5.5M17 8.5l4.5 5.5-4.5 5.5"
        stroke="#fff"
        strokeWidth="2.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="14" cy="14" r="1.8" fill="var(--gold)" />
    </svg>
  );
}

/** Mark + serif wordmark. Color follows `currentColor`. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2.5 font-heading text-[1.3rem] leading-none font-semibold tracking-[-0.01em]",
        className,
      )}
    >
      <LogoMark />
      LemmaYard
    </span>
  );
}
