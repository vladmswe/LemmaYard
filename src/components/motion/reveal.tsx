import * as React from "react";
import { cn } from "cn";

import { revealStyle } from "@/lib/motion";

type RevealTag = "div" | "section" | "li" | "article" | "header" | "aside" | "p" | "span" | "ol" | "ul";

type RevealProps = React.HTMLAttributes<HTMLElement> & {
  as?: RevealTag;
  /** Position in a staggered group: each step adds 70 ms of delay (max 8). */
  index?: number;
  /** Extra delay before the group starts, in ms (mount trigger only). */
  delayMs?: number;
  /**
   * "mount" (default): fades in and rises 8px when the page renders (CSS
   * only). "scroll": fades in and rises 16px when 10% of it scrolls into
   * view (DESIGN.md §11.2), shown by <RevealObserver> in the root layout.
   */
  trigger?: "mount" | "scroll";
};

/**
 * Enter motion for a page section or list item. Server-component friendly.
 * Both triggers render visible markup on the server: the scroll variant is
 * hidden only once the root layout's inline script marked `<html class="js">`,
 * and never under `prefers-reduced-motion`.
 *
 *   <Reveal>…</Reveal>
 *   <Reveal trigger="scroll" index={i}>…</Reveal>
 *
 * For elements you render yourself: `className="rv" style={revealStyle(i)}`.
 */
export function Reveal({
  as = "div",
  index = 0,
  delayMs,
  trigger = "mount",
  className,
  style,
  ...props
}: RevealProps) {
  return React.createElement(as, {
    ...props,
    className: cn(trigger === "scroll" ? "rv" : "reveal", className),
    style: { ...revealStyle(index, trigger === "scroll" ? undefined : delayMs), ...style },
  });
}
