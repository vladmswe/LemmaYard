import { cn } from "cn";

import { Badge } from "@/components/ui/badge";

import { DIFFICULTIES, type Difficulty } from "./difficulty";

/**
 * Difficulty, always as a word plus a shape glyph (■ easy, ◆ medium, ▲ hard;
 * DESIGN.md §6.2), so it never relies on colour alone. `variant="text"` =
 * coloured word for tables, `variant="pill"` = tinted pill for cards.
 */
export function DifficultyBadge({
  difficulty,
  variant = "pill",
  className,
}: {
  difficulty: Difficulty;
  variant?: "pill" | "text";
  className?: string;
}) {
  const d = DIFFICULTIES[difficulty];
  if (variant === "text") {
    return (
      <span
        data-difficulty={difficulty}
        className={cn("diff-mark inline-flex items-center gap-1.5 text-sm font-semibold", d.text, className)}
      >
        {d.label}
      </span>
    );
  }
  return (
    <Badge variant="status" data-difficulty={difficulty} className={cn("diff-mark gap-1.5 px-2.5", d.badge, className)}>
      {d.label}
    </Badge>
  );
}

/**
 * The shape of a difficulty as its own element (decorative: the word carries
 * the meaning). The badge draws the same shape with `.diff-mark::before`.
 */
export function DifficultyGlyph({ difficulty, className }: { difficulty: Difficulty; className?: string }) {
  return <span aria-hidden data-shape={difficulty} className={cn("diff-glyph", className)} />;
}
