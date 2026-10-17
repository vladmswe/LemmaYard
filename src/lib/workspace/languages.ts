import type { Language } from "@/lib/submission-dto";

/** UI names (DESIGN.md §9.4). */
export const LANGUAGE_LABELS: Record<Language, string> = {
  python: "Python 3",
  javascript: "JavaScript",
};

/** Monaco language ids and model file names. */
export const MONACO_LANGUAGE: Record<Language, { id: string; file: string }> = {
  python: { id: "python", file: "solution.py" },
  javascript: { id: "javascript", file: "solution.js" },
};
