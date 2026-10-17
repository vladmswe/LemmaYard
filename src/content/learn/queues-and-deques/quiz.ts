import type { QuizData } from "@/lib/guide/content/types";

export const quizzes: readonly QuizData[] = [
  {
    id: "queues-check",
    questions: [
      {
        id: "q-ring-slot",
        kind: "single",
        prompt: "A ring of capacity 8 has head = 5 and size = 4. You dequeue twice, then enqueue once. Which slot does the enqueue write?",
        choices: [
          { id: "s1", label: "Slot 1", feedback: "Right: after two dequeues head = 7 and size = 2, so tail = (7 + 2) % 8 = 1." },
          { id: "s9", label: "Slot 9", feedback: "There is no slot 9: the index wraps around with % 8." },
          { id: "s3", label: "Slot 3", feedback: "Dequeues move head, not tail: the back of the queue stays at slot 1." },
          { id: "s7", label: "Slot 7", feedback: "7 is the new head, where the front value sits." },
        ],
        answer: ["s1"],
        explain: "Each dequeue moves head on by one: 5 → 6 → 7, and size drops to 2. The tail slot is (head + size) % capacity = 9 % 8 = 1, the same slot as before the dequeues.",
        predictsState: true,
      },
      {
        id: "q-grow-order",
        kind: "single",
        prompt: "A full ring of 4 slots holds [c, d, a, b] in slots 0 to 3, with head = 2 (a is the front). After it grows to 8 slots, what are new slots 0 to 3?",
        choices: [
          { id: "abcd", label: "a, b, c, d", feedback: "Right: new[i] = old[(2 + i) % 4], so the front a lands in slot 0." },
          { id: "cdab", label: "c, d, a, b", feedback: "That copies slot k to slot k; the queue order would break once head moves to 0." },
          { id: "dcba", label: "d, c, b, a", feedback: "The copy keeps queue order; nothing is reversed." },
        ],
        answer: ["abcd"],
        explain: "Unrolling copies the values from head onwards: old[2], old[3], old[0], old[1]. Then head = 0 and the next enqueue goes to slot 4.",
        predictsState: true,
      },
      {
        id: "q-why-size",
        kind: "single",
        prompt: "A ring buffer stores head and tail but no size. What goes wrong?",
        choices: [
          { id: "ambig", label: "head == tail could mean empty or full", feedback: "Right: both states put tail on the head slot, so the ring needs size (or one unused slot)." },
          { id: "slow", label: "Dequeue becomes O(n)", feedback: "Dequeue still moves one index; the problem is telling two states apart." },
          { id: "wrap", label: "The indices can no longer wrap", feedback: "The modulo works the same; it is the full and empty states that look alike." },
        ],
        answer: ["ambig"],
        explain: "With size tracked, the ring is full exactly when size == capacity and empty when size == 0, whatever head and tail say.",
      },
      {
        id: "q-two-stacks",
        kind: "single",
        prompt: "A queue is built from two stacks (inbox and outbox). What do n enqueues and n dequeues cost in total?",
        choices: [
          { id: "n", label: "O(n): O(1) amortized per operation", feedback: "Right: each value is moved from inbox to outbox at most once." },
          { id: "n2", label: "O(n²): each dequeue moves everything", feedback: "Only a dequeue that finds the outbox empty moves values, and each value moves once." },
          { id: "nlogn", label: "O(n log n)", feedback: "There is no halving or sorting here." },
        ],
        answer: ["n"],
        explain: "One dequeue can move n values, which is its O(n) worst case. But every value is pushed and popped at most twice overall.",
      },
      {
        id: "q-undo",
        kind: "single",
        prompt: "An editor keeps your last changes so Undo can reverse the newest one first. Which structure fits?",
        choices: [
          { id: "stack", label: "A stack", feedback: "Right: undo needs the most recent change first, which is LIFO." },
          { id: "queue", label: "A queue", feedback: "A queue would undo your oldest change first." },
          { id: "list", label: "A plain list scanned from the start", feedback: "A list works only if you always take the end, which is a stack." },
        ],
        answer: ["stack"],
        explain: "Undo is last in, first out. A deque helps if you also want to drop the oldest change once the history is full.",
        recall: "stacks",
      },
    ],
  },
];
