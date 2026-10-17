import type { difficultyEnum } from "@/server/db/schema";

export type Difficulty = (typeof difficultyEnum.enumValues)[number];

export type DifficultyMeta = {
  label: string;
  /** Colored text (tables). */
  text: string;
  /** Tinted pill (problem page, cards). */
  badge: string;
  /** Solid fill (profile progress bars). */
  fill: string;
};

// DESIGN.md §4.5. Literal class strings only (Tailwind must see them).
export const DIFFICULTIES: Record<Difficulty, DifficultyMeta> = {
  easy: {
    label: "Easy",
    text: "text-difficulty-easy",
    badge: "bg-difficulty-easy-bg text-difficulty-easy",
    fill: "bg-difficulty-easy",
  },
  medium: {
    label: "Medium",
    text: "text-difficulty-medium",
    badge: "bg-difficulty-medium-bg text-difficulty-medium",
    fill: "bg-difficulty-medium",
  },
  hard: {
    label: "Hard",
    text: "text-difficulty-hard",
    badge: "bg-difficulty-hard-bg text-difficulty-hard",
    fill: "bg-difficulty-hard",
  },
};

export const DIFFICULTY_ORDER: readonly Difficulty[] = ["easy", "medium", "hard"];
