import type { CSSProperties } from "react";
import { cn } from "cn";

type QedProps = {
  /**
   * "inline" (default): 0.4em square after a display headline, sized by the
   * headline's font. A number: a fixed square in px (feeds, toasts, lists).
   */
  size?: "inline" | number;
  /** Snap in with a spring (0.56 s, `--ease-snap`) after `delayMs`. */
  snap?: boolean;
  delayMs?: number;
  /** Dashed outline: the "unfinished proof" (empty states, 404). */
  open?: boolean;
  className?: string;
};

/**
 * The tombstone ∎ (end of proof), DESIGN.md §5. Decorative: always
 * aria-hidden; the text next to it carries the meaning. At most one ∎
 * headline per viewport, and never after a question.
 */
export function Qed({ size = "inline", snap = false, delayMs, open = false, className }: QedProps) {
  const style: CSSProperties & Record<string, string> = {};
  if (typeof size === "number") {
    style.width = `${size}px`;
    style.height = `${size}px`;
    style.marginLeft = "0";
    style.verticalAlign = "middle";
  }
  if (snap && delayMs) style["--qed-delay"] = `${Math.round(delayMs)}ms`;
  return (
    <span
      aria-hidden
      data-snap={snap || undefined}
      className={cn(open ? "qed-open" : "qed", className)}
      style={style}
    />
  );
}
