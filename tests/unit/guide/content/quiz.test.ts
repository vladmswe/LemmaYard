// AC-G-1-10: quiz data of every lesson (and the fixture), plus answer checking.
import { describe, expect, it } from "vitest";

import { isCorrect } from "@/components/guide/content/QuizClient";
import { getLesson, LESSON_DATA, LESSON_SLUGS } from "@/content/learn";
import { FIXTURE_LESSON } from "@/content/learn/_fixture";
import { quizDataSchema, type LessonData, type QuizQuestion } from "@/lib/guide/content/types";

/** Content rules for a published lesson's quiz (PLAN-GUIDE 1.3); [] when fine. */
function publishedQuizProblems(lesson: LessonData): string[] {
  const { slug } = lesson.meta;
  const questions = lesson.quizzes.flatMap((q) => q.questions);
  const [min, max] = slug === "choosing-a-structure" ? [10, 14] : [4, 6];
  const problems: string[] = [];
  if (questions.length < min || questions.length > max) problems.push(`${questions.length} questions, want ${min}-${max}`);
  if (questions.filter((q) => q.predictsState).length < 2) problems.push("fewer than 2 predictsState questions");
  if (slug !== "complexity-basics" && !questions.some((q) => q.recall)) problems.push("no recall question");
  return problems;
}

/** Rules for any quiz: schema, recall points to an earlier lesson, unique question ids. */
function quizProblems(lesson: LessonData): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const quiz of lesson.quizzes) {
    const parsed = quizDataSchema.safeParse(quiz);
    if (!parsed.success) problems.push(...parsed.error.issues.map((i) => `${quiz.id}: ${i.message}`));
    for (const q of quiz.questions) {
      if (ids.has(q.id)) problems.push(`duplicate question id ${q.id}`);
      ids.add(q.id);
      if (q.recall) {
        const earlier = getLesson(q.recall);
        if (!earlier || earlier.order >= lesson.meta.order) problems.push(`${q.id}: recall "${q.recall}" is not an earlier lesson`);
      }
    }
  }
  return problems;
}

describe.each([...LESSON_SLUGS])("quiz.ts of %s", (slug) => {
  const lesson = LESSON_DATA[slug];
  it("is valid", () => {
    expect(quizProblems(lesson)).toEqual([]);
  });
  it.runIf(lesson.meta.status === "published")("meets the published-lesson rules", () => {
    expect(publishedQuizProblems(lesson)).toEqual([]);
  });
});

describe("fixture quiz", () => {
  it("is valid and covers single, multi and order questions", () => {
    expect(quizProblems(FIXTURE_LESSON)).toEqual([]);
    expect(FIXTURE_LESSON.quizzes[0]?.questions.map((q) => q.kind)).toEqual(["single", "multi", "order"]);
  });
});

const base: QuizQuestion = {
  id: "q",
  kind: "single",
  prompt: "p",
  choices: [
    { id: "a", label: "A", feedback: "fa" },
    { id: "b", label: "B", feedback: "fb" },
    { id: "c", label: "C", feedback: "fc" },
  ],
  answer: ["a"],
  explain: "e",
};

describe("quiz rules catch mistakes", () => {
  it("rejects an answer that is not a choice, empty feedback and incomplete order answers", () => {
    const issues = (q: unknown) => quizDataSchema.safeParse({ id: "x", questions: [q] }).error?.issues.map((i) => i.message) ?? [];
    expect(issues(base)).toEqual([]);
    expect(issues({ ...base, answer: ["z"] })).toEqual(['q: answer "z" is not a choice']);
    expect(issues({ ...base, choices: [...base.choices.slice(0, 2), { id: "c", label: "C", feedback: "" }] }).length).toBe(1);
    expect(issues({ ...base, kind: "order", answer: ["a", "b"] })).toEqual([
      "q: an order question lists every choice in its answer",
    ]);
    expect(issues({ ...base, answer: ["a", "b"] })).toEqual(["q: a single-choice question has exactly one answer"]);
  });

  it("checks the published rules: count, predictsState, recall", () => {
    const lesson = (questions: QuizQuestion[], slug = "stacks"): LessonData => ({
      ...LESSON_DATA.stacks,
      meta: { ...LESSON_DATA.stacks.meta, slug, status: "published" },
      quizzes: [{ id: "x", questions }],
    });
    const q = (id: string, extra: Partial<QuizQuestion> = {}): QuizQuestion => ({ ...base, id, ...extra });
    expect(publishedQuizProblems(lesson([q("1"), q("2"), q("3")]))).toEqual([
      "3 questions, want 4-6",
      "fewer than 2 predictsState questions",
      "no recall question",
    ]);
    const good = [q("1", { predictsState: true }), q("2", { predictsState: true }), q("3", { recall: "arrays" }), q("4")];
    expect(publishedQuizProblems(lesson(good))).toEqual([]);
    expect(quizProblems(lesson([q("1", { recall: "heaps" })]))).toEqual(['1: recall "heaps" is not an earlier lesson']);
  });
});

describe("isCorrect", () => {
  it("compares sets for single and multi, sequences for order", () => {
    expect(isCorrect(base, ["a"])).toBe(true);
    expect(isCorrect(base, ["b"])).toBe(false);
    const multi: QuizQuestion = { ...base, kind: "multi", answer: ["a", "c"] };
    expect(isCorrect(multi, ["c", "a"])).toBe(true);
    expect(isCorrect(multi, ["a"])).toBe(false);
    expect(isCorrect(multi, ["a", "b", "c"])).toBe(false);
    const order: QuizQuestion = { ...base, kind: "order", answer: ["c", "b", "a"] };
    expect(isCorrect(order, ["c", "b", "a"])).toBe(true);
    expect(isCorrect(order, ["a", "b", "c"])).toBe(false);
  });
});
