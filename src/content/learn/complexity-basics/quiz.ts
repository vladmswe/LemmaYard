import type { QuizData } from "@/lib/guide/content/types";

export const quizzes: readonly QuizData[] = [
  {
    id: "complexity-basics-check",
    questions: [
      {
        id: "cb-linear-absent",
        kind: "single",
        prompt: "Linear search runs on an array of 32 numbers, and the target is not in it. How many comparisons does it make?",
        choices: [
          { id: "c5", label: "5", feedback: "That is about log₂ 32, the count for binary search, not for a scan." },
          { id: "c16", label: "16", feedback: "Half the array is the average when the target is present. Here it is missing." },
          { id: "c32", label: "32", feedback: "Right: a missing target means every cell is compared once." },
        ],
        answer: ["c32"],
        explain: "A missing target is the worst case for linear search: it compares all n = 32 cells.",
        predictsState: true,
      },
      {
        id: "cb-binary-next",
        kind: "single",
        prompt:
          "Binary search on a sorted array of 16 numbers first checks index 8 and finds a value smaller than the target. The range is now [9, 16). Which index does it check next?",
        choices: [
          { id: "i9", label: "9", feedback: "That is lo. Binary search reads the middle of the range, not its start." },
          { id: "i12", label: "12", feedback: "Right: (9 + 16) // 2 = 12." },
          { id: "i15", label: "15", feedback: "That is the last cell of the range, not its middle." },
          { id: "i16", label: "16", feedback: "16 is hi, one past the end of the range; it is never read." },
        ],
        answer: ["i12"],
        explain: "The middle of [lo, hi) is (lo + hi) // 2 = (9 + 16) // 2 = 12.",
        predictsState: true,
      },
      {
        id: "cb-log-times-ten",
        kind: "single",
        prompt: "Binary search needs about 20 comparisons on a million sorted numbers. About how many does it need on ten million?",
        choices: [
          { id: "c23", label: "About 23", feedback: "Right: ten times more data adds log₂ 10 ≈ 3.3 halvings." },
          { id: "c40", label: "About 40", feedback: "Twice the comparisons would need n squared, not n times 10." },
          { id: "c200", label: "About 200", feedback: "That would be linear growth. A logarithm grows far slower." },
        ],
        answer: ["c23"],
        explain: "log₂(10n) = log₂ n + log₂ 10, so multiplying n by 10 adds about 3.3 comparisons.",
      },
      {
        id: "cb-sum-squares",
        kind: "single",
        prompt: "A loop does i² steps for each i from 1 to n. What is the total, in Big-Theta terms?",
        choices: [
          { id: "n2", label: "Θ(n²)", feedback: "Each term can be as large as n², and there are n of them." },
          { id: "n3", label: "Θ(n³)", feedback: "Right: the sum is n(n+1)(2n+1)/6, whose leading term is n³/3." },
          { id: "exact", label: "Exactly n³", feedback: "The exact sum is n(n+1)(2n+1)/6, which is about n³/3, not n³." },
        ],
        answer: ["n3"],
        explain: "1² + 2² + … + n² = n(n+1)(2n+1)/6. Dropping constants and lower terms leaves Θ(n³).",
      },
      {
        id: "cb-cases",
        kind: "multi",
        prompt: "Which statements are true? Pick all that apply.",
        choices: [
          {
            id: "worst",
            label: "Linear search is O(n) in the worst case.",
            feedback: "True: at most one comparison per cell.",
          },
          {
            id: "best",
            label: "Linear search takes one comparison in the best case.",
            feedback: "True: the target can sit at index 0.",
          },
          {
            id: "amortized-luck",
            label: "An amortized bound can fail if you are unlucky with the inputs.",
            feedback: "False: an amortized bound holds for every sequence of operations. That is the difference from an average-case bound.",
          },
          {
            id: "binary-value",
            label: "Binary search returns the value it found.",
            feedback: "False: it returns the index of the target (or −1), and it needs a sorted array.",
          },
        ],
        answer: ["worst", "best"],
        explain: "Worst and best case describe single inputs; amortized cost is a guarantee over any sequence; binary search returns an index.",
      },
    ],
  },
];
