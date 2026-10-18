import type { Language } from "@/lib/submission-dto";

/** UI names (DESIGN.md §9.4). */
export const LANGUAGE_LABELS: Record<Language, string> = {
  python: "Python 3",
  javascript: "JavaScript",
  java: "Java",
};

/** Monaco language ids and model file names. */
export const MONACO_LANGUAGE: Record<Language, { id: string; file: string }> = {
  python: { id: "python", file: "solution.py" },
  javascript: { id: "javascript", file: "solution.js" },
  java: { id: "java", file: "Solution.java" },
};

/** Short names for running text ("Python", not "Python 3"). */
export const LANGUAGE_NAMES: Record<Language, string> = {
  python: "Python",
  javascript: "JavaScript",
  java: "Java",
};

/** "Python, JavaScript or Java" (with `joiner` "and" or "or"). */
export function languageList(languages: readonly Language[], joiner: "and" | "or"): string {
  const names = languages.map((l) => LANGUAGE_NAMES[l]);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} ${joiner} ${names[names.length - 1]}`;
}
