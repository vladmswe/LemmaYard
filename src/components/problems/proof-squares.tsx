import { cn } from "cn";

import { DIFFICULTIES, type Difficulty } from "./difficulty";

/**
 * The proof sheet's squares for one difficulty (DESIGN.md §13.7, catalog
 * progress card): one square per published problem, filled in the
 * difficulty colour = solved, dashed = attempted, outline = not started.
 * Decorative (aria-hidden): the adjacent "7 / 11" carries the meaning.
 * Above `max` problems only the numbers next to it remain meaningful, so
 * the strip is capped (the last square then stands for "and more").
 */
export function ProofSquares({
  difficulty,
  solved,
  attempted,
  total,
  size = "md",
  max = 60,
  className,
}: {
  difficulty: Difficulty;
  solved: number;
  attempted: number;
  total: number;
  size?: "sm" | "md";
  max?: number;
  className?: string;
}) {
  const d = DIFFICULTIES[difficulty];
  const n = Math.min(Math.max(0, total), max);
  const s = Math.min(solved, n);
  const a = Math.min(attempted, n - s);
  return (
    <span
      aria-hidden
      data-testid="proof-squares"
      className={cn("flex flex-wrap", size === "sm" ? "gap-[3px]" : "gap-1.5", className)}
    >
      {Array.from({ length: n }, (_, i) => {
        const state = i < s ? "solved" : i < s + a ? "attempted" : "todo";
        return (
          <i
            key={i}
            data-state={state}
            className={cn(
              "block shrink-0 border-[1.5px]",
              size === "sm" ? "size-2.5 rounded-[2px]" : "size-[22px] rounded-[5px] max-sm:size-[18px]",
              state === "solved" && [d.fill, d.line],
              state === "attempted" && ["border-dashed", d.line],
              state === "todo" && "border-border-strong",
            )}
          />
        );
      })}
    </span>
  );
}
