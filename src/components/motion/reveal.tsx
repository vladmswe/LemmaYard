import * as React from "react";
import { cn } from "cn";

import { revealStyle } from "@/lib/motion";

type RevealTag = "div" | "section" | "li" | "article" | "header" | "aside" | "p" | "span";

type RevealProps = React.HTMLAttributes<HTMLElement> & {
  as?: RevealTag;
  /** Position in a staggered group: each step adds 60 ms of delay. */
  index?: number;
  /** Extra delay before the group starts, in ms. */
  delayMs?: number;
};

/**
 * Enter transition for a page section or list item: fades in and rises 8px
 * over 260 ms (`.reveal` in globals.css). CSS-only, so it works in server
 * components and needs no JS. Under `prefers-reduced-motion` it is instant.
 *
 *   <Reveal>…</Reveal>
 *   {items.map((x, i) => <Reveal as="li" index={i} key={x.id}>…</Reveal>)}
 *
 * For elements you render yourself: `className="reveal" style={revealStyle(i)}`.
 */
export function Reveal({ as = "div", index = 0, delayMs, className, style, ...props }: RevealProps) {
  return React.createElement(as, {
    ...props,
    className: cn("reveal", className),
    style: { ...revealStyle(index, delayMs), ...style },
  });
}
