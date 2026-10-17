// Learner progress for the guide, kept in localStorage only (PLAN-GUIDE D3, 2.8).
// Pure functions for the state transitions plus a tiny external store for
// React. Corrupt JSON resets silently; unavailable storage never throws.
import { useSyncExternalStore } from "react";

export const PROGRESS_KEY = "lemmayard.learn.progress.v1";
const EVENT = "lemmayard-learn-progress";

export interface LessonProgress {
  readonly visited: string; // ISO time of the first visit
  readonly completed?: string; // ISO time
  readonly quiz?: Readonly<Record<string, boolean>>; // questionId -> last answer correct
}

export interface Progress {
  readonly v: 1;
  readonly last?: string;
  readonly lessons: Readonly<Record<string, LessonProgress>>;
}

export const EMPTY_PROGRESS: Progress = { v: 1, lessons: {} };

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/** Parses the stored JSON; anything malformed yields EMPTY_PROGRESS (bad lesson entries are dropped). */
export function parseProgress(raw: string | null): Progress {
  if (!raw) return EMPTY_PROGRESS;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_PROGRESS;
  }
  if (!isObject(data) || data.v !== 1 || !isObject(data.lessons)) return EMPTY_PROGRESS;
  const lessons: Record<string, LessonProgress> = {};
  for (const [slug, entry] of Object.entries(data.lessons)) {
    if (!isObject(entry) || typeof entry.visited !== "string") continue;
    const quiz: Record<string, boolean> = {};
    if (isObject(entry.quiz)) {
      for (const [q, ok] of Object.entries(entry.quiz)) if (typeof ok === "boolean") quiz[q] = ok;
    }
    lessons[slug] = {
      visited: entry.visited,
      ...(typeof entry.completed === "string" ? { completed: entry.completed } : {}),
      ...(Object.keys(quiz).length > 0 ? { quiz } : {}),
    };
  }
  return { v: 1, ...(typeof data.last === "string" ? { last: data.last } : {}), lessons };
}

function lessonOf(p: Progress, slug: string, now: string): LessonProgress {
  return p.lessons[slug] ?? { visited: now };
}

function withLesson(p: Progress, slug: string, entry: LessonProgress, last = p.last): Progress {
  return { v: 1, ...(last ? { last } : {}), lessons: { ...p.lessons, [slug]: entry } };
}

/** First visit starts the lesson ("In progress"); every visit makes it the "Continue" target. */
export function markVisited(p: Progress, slug: string, now: string): Progress {
  return withLesson(p, slug, lessonOf(p, slug, now), slug);
}

/**
 * Stores the latest answer to one quiz question. When every question of the
 * lesson has an answer (any score), the lesson becomes completed.
 */
export function recordQuiz(
  p: Progress,
  slug: string,
  questionId: string,
  correct: boolean,
  opts: { now: string; questionIds?: readonly string[] },
): Progress {
  const prev = lessonOf(p, slug, opts.now);
  const quiz = { ...prev.quiz, [questionId]: correct };
  const all = opts.questionIds && opts.questionIds.length > 0 && opts.questionIds.every((q) => q in quiz);
  const completed = prev.completed ?? (all ? opts.now : undefined);
  return withLesson(p, slug, { visited: prev.visited, ...(completed ? { completed } : {}), quiz });
}

/** "Mark lesson as complete" toggle. */
export function toggleComplete(p: Progress, slug: string, now: string): Progress {
  const prev = lessonOf(p, slug, now);
  const { completed, ...rest } = prev;
  return withLesson(p, slug, completed ? rest : { ...rest, completed: now });
}

export type LessonStatus = "not-started" | "in-progress" | "completed";
export const STATUS_LABELS: Record<LessonStatus, string> = {
  "not-started": "Not started",
  "in-progress": "In progress",
  completed: "Completed",
};

export interface LessonSummary {
  readonly status: LessonStatus;
  readonly quizCorrect: number;
  readonly quizAnswered: number;
  readonly quizTotal: number;
}

/** Status and quiz score of one lesson; only answers to the current questions count. */
export function summarize(p: Progress, slug: string, questionIds: readonly string[] = []): LessonSummary {
  const entry = p.lessons[slug];
  const quiz = entry?.quiz ?? {};
  const answered = questionIds.filter((q) => q in quiz);
  return {
    status: !entry ? "not-started" : entry.completed ? "completed" : "in-progress",
    quizCorrect: answered.filter((q) => quiz[q] === true).length,
    quizAnswered: answered.length,
    quizTotal: questionIds.length,
  };
}

// ------------------------------------------------------------- the store

export interface ProgressStore {
  read(): Progress;
  update(fn: (p: Progress) => Progress): Progress;
  subscribe(onChange: () => void): () => void;
}

/** A store over any Storage; `getStorage` may throw (private mode, blocked cookies). */
export function createProgressStore(getStorage: () => Storage, target?: EventTarget): ProgressStore {
  let cachedRaw: string | null | undefined;
  let cached: Progress = EMPTY_PROGRESS;
  let memory: Progress | null = null; // fallback when storage cannot be written

  const read = (): Progress => {
    let raw: string | null = null;
    try {
      raw = getStorage().getItem(PROGRESS_KEY);
    } catch {
      return memory ?? EMPTY_PROGRESS;
    }
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      cached = parseProgress(raw);
    }
    return cached;
  };

  return {
    read,
    update(fn) {
      const next = fn(read());
      try {
        getStorage().setItem(PROGRESS_KEY, JSON.stringify(next));
      } catch {
        memory = next; // keep working for this page view
      }
      target?.dispatchEvent(new Event(EVENT));
      return next;
    },
    subscribe(onChange) {
      if (!target) return () => {};
      target.addEventListener("storage", onChange);
      target.addEventListener(EVENT, onChange);
      return () => {
        target.removeEventListener("storage", onChange);
        target.removeEventListener(EVENT, onChange);
      };
    },
  };
}

let browserStore: ProgressStore | undefined;

/** The browser store (window.localStorage); call only in effects and event handlers. */
export function progressStore(): ProgressStore {
  browserStore ??= createProgressStore(() => window.localStorage, window);
  return browserStore;
}

const noop = () => () => {};

/** Current progress; EMPTY_PROGRESS on the server and during hydration. */
export function useProgress(): Progress {
  return useSyncExternalStore(
    typeof window === "undefined" ? noop : (cb) => progressStore().subscribe(cb),
    () => progressStore().read(),
    () => EMPTY_PROGRESS,
  );
}
