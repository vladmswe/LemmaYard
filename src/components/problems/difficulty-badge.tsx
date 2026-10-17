import { cn } from "cn";

import { Badge } from "@/components/ui/badge";

import { DIFFICULTIES, type Difficulty } from "./difficulty";

/**
 * Difficulty, always as a word. `variant="text"` = colored text for tables,
 * `variant="pill"` = tinted pill for the problem page and cards.
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
      <span data-difficulty={difficulty} className={cn("text-sm font-semibold", d.text, className)}>
        {d.label}
      </span>
    );
  }
  return (
    <Badge variant="status" data-difficulty={difficulty} className={cn(d.badge, className)}>
      {d.label}
    </Badge>
  );
}
