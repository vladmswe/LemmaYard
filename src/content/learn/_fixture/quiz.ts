import type { QuizData } from "@/lib/guide/content/types";

export const quizzes: readonly QuizData[] = [
  {
    id: "fixture-check",
    questions: [
      {
        id: "fixture-top",
        kind: "single",
        prompt: "After push 1, push 2, pop, push 3, which value is on top?",
        choices: [
          { id: "one", label: "1", feedback: "1 is at the bottom; two values went on after it." },
          { id: "two", label: "2", feedback: "2 was popped before 3 arrived." },
          { id: "three", label: "3", feedback: "Yes: 3 was pushed last and nothing removed it." },
        ],
        answer: ["three"],
        explain: "A stack returns the most recent push that was not popped yet: 3.",
        predictsState: true,
      },
      {
        id: "fixture-constant",
        kind: "multi",
        prompt: "Which operations take O(1) time on an array-backed stack (ignoring resizing)?",
        choices: [
          { id: "push", label: "push", feedback: "Push writes one slot at the end." },
          { id: "peek", label: "peek", feedback: "Peek reads the last slot." },
          { id: "search", label: "find a value", feedback: "Finding an arbitrary value may look at every slot: O(n)." },
        ],
        answer: ["push", "peek"],
        explain: "Push and peek touch only the top; a search may scan the whole stack.",
      },
      {
        id: "fixture-order",
        kind: "order",
        prompt: "Put the values in the order pop returns them after push a, push b, push c.",
        choices: [
          { id: "a", label: "a", feedback: "a went in first, so it comes out last." },
          { id: "b", label: "b", feedback: "b sits in the middle." },
          { id: "c", label: "c", feedback: "c went in last, so it comes out first." },
        ],
        answer: ["c", "b", "a"],
        explain: "Last in, first out: c, then b, then a.",
        predictsState: true,
        recall: "arrays",
      },
    ],
  },
];
