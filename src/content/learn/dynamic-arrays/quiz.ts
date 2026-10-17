import type { QuizData } from "@/lib/guide/content/types";

export const quizzes: readonly QuizData[] = [
  {
    id: "dynamic-arrays-check",
    questions: [
      {
        id: "da-grow-copies",
        kind: "single",
        prompt: "A dynamic array has capacity 4 and size 4. How many element copies does the next append cause?",
        choices: [
          { id: "c0", label: "0", feedback: "There is no free slot, so the array has to resize before it can write." },
          { id: "c1", label: "1", feedback: "One write stores the new value, but the resize copies the old elements first." },
          { id: "c4", label: "4", feedback: "Right: all 4 stored elements move to the new buffer of 8 slots." },
          { id: "c8", label: "8", feedback: "8 is the new capacity; only the 4 stored elements are copied." },
        ],
        answer: ["c4"],
        explain: "A full array grows to capacity 8 and copies its 4 elements, then writes the new value.",
        predictsState: true,
      },
      {
        id: "da-capacity-after",
        kind: "single",
        prompt: "Starting from capacity 1 and doubling when full, what is the capacity after 5 appends?",
        choices: [
          { id: "c5", label: "5", feedback: "The capacity is always a power of two here: 1, 2, 4, 8, …" },
          { id: "c8", label: "8", feedback: "Right: it grows 1 → 2 → 4 → 8, and the fifth value fits in the buffer of 8." },
          { id: "c16", label: "16", feedback: "That would need a ninth append." },
        ],
        answer: ["c8"],
        explain: "Resizes happen at sizes 1, 2 and 4, giving capacities 2, 4 and 8.",
        predictsState: true,
      },
      {
        id: "da-shrink",
        kind: "single",
        prompt: "Capacity 16, size 5, shrink rule \"at a quarter, to half\". You pop once. What is the capacity afterwards?",
        choices: [
          { id: "c16", label: "16", feedback: "After the pop the size is 4, exactly a quarter of 16, so the rule fires." },
          { id: "c8", label: "8", feedback: "Right: size 4 ≤ 16 / 4, so the buffer halves to 8 and stays half full." },
          { id: "c4", label: "4", feedback: "The rule halves the capacity; it does not shrink it to the size." },
        ],
        answer: ["c8"],
        explain: "After the pop, 4 elements sit in 16 slots, a quarter, so the array moves to 8 slots.",
        predictsState: true,
      },
      {
        id: "da-why-quarter",
        kind: "single",
        prompt: "Why shrink when the array is a quarter full rather than half full?",
        choices: [
          { id: "memory", label: "It saves more memory", feedback: "It actually keeps more spare room; the point is fewer resizes." },
          {
            id: "thrash",
            label: "So that alternating append and pop near the boundary cannot resize every time",
            feedback: "Right: after shrinking to half, the buffer is half full, so many operations must pass before the next resize.",
          },
          { id: "faster-copy", label: "Copying a quarter of the array is faster", feedback: "The copy moves every stored element either way." },
        ],
        answer: ["thrash"],
        explain: "Shrinking at half leaves a full buffer, so the next append grows it again: thrashing. Shrinking at a quarter avoids it.",
      },
      {
        id: "da-insert-front",
        kind: "single",
        prompt: "A dynamic array holds n elements and has spare capacity. What does inserting at index 0 cost in the worst case?",
        choices: [
          { id: "o1", label: "O(1) amortized", feedback: "That is append at the end. Inserting at the front shifts every element." },
          { id: "on", label: "O(n)", feedback: "Right: all n elements move one slot right, as in a plain array." },
          { id: "ologn", label: "O(log n)", feedback: "Nothing is halved; each element moves once." },
        ],
        answer: ["on"],
        explain: "Spare capacity only helps at the end. An insert at index i shifts n − i elements, so index 0 costs O(n).",
        recall: "arrays",
      },
    ],
  },
];
