import type { QuizData } from "@/lib/guide/content/types";

export const quizzes: readonly QuizData[] = [
  {
    id: "arrays-check",
    questions: [
      {
        id: "ar-insert-moves",
        kind: "single",
        prompt: "An array holds 8 elements and has room for more. How many elements move when you insert a value at index 3?",
        choices: [
          { id: "m3", label: "3", feedback: "Those are the elements before the gap; they stay where they are." },
          { id: "m5", label: "5", feedback: "Right: indices 3 to 7 each move one slot right, 8 − 3 = 5 moves." },
          { id: "m8", label: "8", feedback: "Only the elements from index 3 onwards move, not all of them." },
        ],
        answer: ["m5"],
        explain: "Inserting at i shifts the n − i elements from i to the end: 8 − 3 = 5.",
        predictsState: true,
      },
      {
        id: "ar-prefix-build",
        kind: "single",
        prompt: "What is the prefix-sum array p of a = [2, 7, 1, 5]?",
        choices: [
          { id: "with-zero", label: "[0, 2, 9, 10, 15]", feedback: "Right: n + 1 cells, starting with the sentinel 0." },
          { id: "no-zero", label: "[2, 9, 10, 15]", feedback: "These are the running totals, but the leading 0 is missing, so ranges from index 0 need a special case." },
          { id: "shifted", label: "[0, 2, 9, 10]", feedback: "The last cell, the sum of all four numbers (15), is missing." },
        ],
        answer: ["with-zero"],
        explain: "p[0] = 0 and p[i + 1] = p[i] + a[i]: 0, 2, 9, 10, 15.",
        predictsState: true,
      },
      {
        id: "ar-range-query",
        kind: "single",
        prompt: "With p = [0, 2, 9, 10, 15] for a = [2, 7, 1, 5], which expression gives the sum of the half-open range [1, 3)?",
        choices: [
          { id: "p3-p1", label: "p[3] − p[1] = 8", feedback: "Right: a[1] + a[2] = 7 + 1 = 8." },
          { id: "p3-p0", label: "p[3] − p[0] = 10", feedback: "That is the sum of [0, 3); it includes a[0]." },
          { id: "p4-p1", label: "p[4] − p[1] = 13", feedback: "That is the sum of [1, 4); the half-open range [1, 3) stops before index 3." },
        ],
        answer: ["p3-p1"],
        explain: "The sum of [l, r) is p[r] − p[l]; here p[3] − p[1] = 10 − 2 = 8.",
      },
      {
        id: "ar-merge-ran-out",
        kind: "single",
        prompt: "Merging A = [1, 4] with B = [2, 3, 9, 12]: after C = [1, 2, 3, 4], A is used up. What happens next?",
        choices: [
          { id: "copy", label: "Copy 9 and 12 from B as they are", feedback: "Right: the rest of B is already sorted and nothing is left to compare." },
          { id: "compare", label: "Keep comparing A[i] with B[j]", feedback: "A has no element left, so there is nothing to compare; reading A[2] would go past its end." },
          { id: "sort", label: "Sort what is left of B first", feedback: "B is sorted already, and so is any part of it." },
        ],
        answer: ["copy"],
        explain: "When one array runs out, the rest of the other is copied over unchanged. C becomes [1, 2, 3, 4, 9, 12].",
        predictsState: true,
      },
      {
        id: "ar-front-insert-cost",
        kind: "single",
        prompt: "You call Python list.insert(0, x) (or JavaScript unshift) n times to build a list of n items. What is the total cost in the worst case?",
        choices: [
          { id: "n", label: "O(n)", feedback: "Each call is not O(1): it shifts every element already in the list." },
          { id: "nlogn", label: "O(n log n)", feedback: "Nothing is halved here; call k shifts k − 1 elements." },
          { id: "n2", label: "O(n²)", feedback: "Right: 0 + 1 + … + (n − 1) shifts, about n²/2." },
        ],
        answer: ["n2"],
        explain: "Inserting at the front shifts all current elements, so the total is 0 + 1 + … + (n − 1) = n(n − 1)/2, which is O(n²).",
        recall: "complexity-basics",
      },
    ],
  },
];
