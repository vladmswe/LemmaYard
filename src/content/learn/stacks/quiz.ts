import type { QuizData } from "@/lib/guide/content/types";

export const quizzes: readonly QuizData[] = [
  {
    id: "stacks-check",
    questions: [
      {
        id: "st-top-after",
        kind: "single",
        prompt: "Start with an empty stack. push 4, push 7, pop, push 2, push 9, pop. What is on top now?",
        choices: [
          { id: "v4", label: "4", feedback: "4 is at the bottom; 2 was pushed on top of it later." },
          { id: "v7", label: "7", feedback: "7 left with the first pop." },
          { id: "v2", label: "2", feedback: "Right: the stack is 4, 2 from bottom to top." },
          { id: "v9", label: "9", feedback: "9 was pushed, then removed by the last pop." },
        ],
        answer: ["v2"],
        explain: "Each pop removes the newest value: first 7, then 9. What remains is 4 with 2 on top.",
        predictsState: true,
      },
      {
        id: "st-brackets-left",
        kind: "single",
        prompt: "You check the text {[a(b)]}( with a stack. What is on the stack when the scan ends?",
        choices: [
          { id: "empty", label: "Nothing: the text is balanced", feedback: "The last character is an opener, and nothing closes it." },
          { id: "paren", label: "One (: the text is unbalanced", feedback: "Right: every pair closes except the final (, which is left on the stack." },
          { id: "brace", label: "{ and (: the text is unbalanced", feedback: "The } closes the { before the final ( is pushed." },
        ],
        answer: ["paren"],
        explain: "{ [ ( are pushed, then ), ] and } each pop their partner. The letters are skipped. The last ( stays: unbalanced.",
        predictsState: true,
      },
      {
        id: "st-why-not-count",
        kind: "single",
        prompt: "Why is counting openers and closers of each kind not enough to check brackets?",
        choices: [
          { id: "slow", label: "Counting is slower than a stack", feedback: "Both read each character once; the problem is correctness." },
          {
            id: "cross",
            label: "Counts cannot see crossed pairs such as ([)]",
            feedback: "Right: ([)] has one of each bracket, but the ) arrives while [ is on top.",
          },
          { id: "letters", label: "Counting cannot skip letters", feedback: "A counter can skip letters just as easily; it misses the order of the pairs." },
        ],
        answer: ["cross"],
        explain: "Balanced brackets must nest. Only the order of the openers, which the stack keeps, tells whether a closer matches the latest one.",
      },
      {
        id: "st-next-greater",
        kind: "single",
        prompt: "What does the next greater element scan return for [2, 1, 5, 3]? (-1 means no larger value to the right.)",
        choices: [
          { id: "a", label: "[5, 5, -1, -1]", feedback: "Right: 5 answers both 2 and 1, and nothing after 5 or 3 is larger." },
          { id: "b", label: "[1, 5, 3, -1]", feedback: "These are just the next values; 1 is not larger than 2." },
          { id: "c", label: "[5, 5, 3, -1]", feedback: "3 is smaller than 5, so it is not 5's next greater value." },
        ],
        answer: ["a"],
        explain: "When 5 arrives it pops 1 and then 2, giving both the answer 5. Then 3 is pushed on top of 5 and both stay to the end.",
        predictsState: true,
      },
      {
        id: "st-push-cost",
        kind: "single",
        prompt: "An array-backed stack holds n values and its array is full. What does the next push cost in the worst case?",
        choices: [
          { id: "o1", label: "O(1)", feedback: "That is the amortized cost. This particular push has to grow the array first." },
          { id: "on", label: "O(n)", feedback: "Right: the array doubles and copies all n values before the write." },
          { id: "ologn", label: "O(log n)", feedback: "Nothing is halved here; every value is copied once." },
        ],
        answer: ["on"],
        explain: "A full array must move to a buffer twice as large, which copies n values. Spread over many pushes, the cost is O(1) amortized.",
        recall: "dynamic-arrays",
      },
    ],
  },
];
