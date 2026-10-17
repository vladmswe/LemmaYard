// AC-G-1-12: progress store (pure functions + storage handling).
import { describe, expect, it } from "vitest";

import {
  createProgressStore,
  EMPTY_PROGRESS,
  markVisited,
  parseProgress,
  PROGRESS_KEY,
  recordQuiz,
  summarize,
  toggleComplete,
  type Progress,
} from "@/lib/guide/content/progress";

const T1 = "2026-10-17T10:00:00.000Z";
const T2 = "2026-10-17T11:00:00.000Z";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

describe("pure transitions", () => {
  it("markVisited starts a lesson once and makes it the last one", () => {
    const p1 = markVisited(EMPTY_PROGRESS, "arrays", T1);
    expect(p1).toEqual({ v: 1, last: "arrays", lessons: { arrays: { visited: T1 } } });
    const p2 = markVisited(p1, "stacks", T2);
    const p3 = markVisited(p2, "arrays", T2);
    expect(p3.last).toBe("arrays");
    expect(p3.lessons.arrays?.visited).toBe(T1); // first visit is kept
    expect(Object.keys(p3.lessons)).toEqual(["arrays", "stacks"]);
  });

  it("recordQuiz stores the latest answer and completes the lesson when every question is answered", () => {
    const ids = ["q1", "q2"];
    let p = recordQuiz(EMPTY_PROGRESS, "arrays", "q1", false, { now: T1, questionIds: ids });
    expect(p.lessons.arrays).toEqual({ visited: T1, quiz: { q1: false } });
    p = recordQuiz(p, "arrays", "q1", true, { now: T1, questionIds: ids });
    expect(p.lessons.arrays?.quiz).toEqual({ q1: true });
    expect(p.lessons.arrays?.completed).toBeUndefined();
    p = recordQuiz(p, "arrays", "q2", false, { now: T2, questionIds: ids });
    expect(p.lessons.arrays?.completed).toBe(T2); // any score completes
  });

  it("toggleComplete switches completion on and off", () => {
    const on = toggleComplete(markVisited(EMPTY_PROGRESS, "heaps", T1), "heaps", T2);
    expect(on.lessons.heaps).toEqual({ visited: T1, completed: T2 });
    const off = toggleComplete(on, "heaps", T2);
    expect(off.lessons.heaps).toEqual({ visited: T1 });
  });

  it("summarize reports status and quiz score for the current questions only", () => {
    expect(summarize(EMPTY_PROGRESS, "arrays", ["q1"])).toEqual({
      status: "not-started",
      quizCorrect: 0,
      quizAnswered: 0,
      quizTotal: 1,
    });
    let p: Progress = markVisited(EMPTY_PROGRESS, "arrays", T1);
    expect(summarize(p, "arrays").status).toBe("in-progress");
    p = recordQuiz(p, "arrays", "q1", true, { now: T1 });
    p = recordQuiz(p, "arrays", "old", false, { now: T1 });
    expect(summarize(p, "arrays", ["q1", "q2"])).toEqual({
      status: "in-progress",
      quizCorrect: 1,
      quizAnswered: 1,
      quizTotal: 2,
    });
    expect(summarize(toggleComplete(p, "arrays", T2), "arrays").status).toBe("completed");
  });
});

describe("parseProgress", () => {
  it.each([null, "", "{", "[]", "42", '{"v":2,"lessons":{}}', '{"v":1}', '{"v":1,"lessons":[]}'])(
    "resets corrupt or foreign data (%s)",
    (raw) => {
      expect(parseProgress(raw)).toEqual(EMPTY_PROGRESS);
    },
  );

  it("drops malformed lesson entries and keeps the good ones", () => {
    const raw = JSON.stringify({
      v: 1,
      last: "arrays",
      lessons: { arrays: { visited: T1, quiz: { a: true, b: "yes" } }, bad: { visited: 3 }, worse: null },
    });
    expect(parseProgress(raw)).toEqual({ v: 1, last: "arrays", lessons: { arrays: { visited: T1, quiz: { a: true } } } });
  });
});

describe("createProgressStore", () => {
  it("reads and writes the versioned key", () => {
    const storage = memoryStorage();
    const store = createProgressStore(() => storage);
    store.update((p) => markVisited(p, "arrays", T1));
    expect(JSON.parse(storage.getItem(PROGRESS_KEY) ?? "null")).toEqual({
      v: 1,
      last: "arrays",
      lessons: { arrays: { visited: T1 } },
    });
    expect(store.read().last).toBe("arrays");
  });

  it("resets silently when the stored JSON is corrupt", () => {
    const store = createProgressStore(() => memoryStorage({ [PROGRESS_KEY]: "{not json" }));
    expect(store.read()).toEqual(EMPTY_PROGRESS);
    expect(store.update((p) => markVisited(p, "arrays", T1)).lessons.arrays).toEqual({ visited: T1 });
  });

  it("does not crash when storage throws on access", () => {
    const store = createProgressStore(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(store.read()).toEqual(EMPTY_PROGRESS);
    const next = store.update((p) => markVisited(p, "arrays", T1));
    expect(next.last).toBe("arrays");
    expect(store.read().last).toBe("arrays"); // kept in memory for this page view
  });

  it("notifies subscribers on update", () => {
    const target = new EventTarget();
    const store = createProgressStore(() => memoryStorage(), target);
    let calls = 0;
    const off = store.subscribe(() => calls++);
    store.update((p) => markVisited(p, "arrays", T1));
    off();
    store.update((p) => markVisited(p, "stacks", T1));
    expect(calls).toBe(1);
  });
});
